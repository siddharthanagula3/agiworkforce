---
id: "F005-07"
type: "feature"
title: "Breadcrumbs, back and forward, and links"
aliases: ["Back and forward", "History controls", "Open link route", "/open/[target]/[id]", "Product link", "Deep link", "Link unavailable screen", "Route loading and not-found", "Go back (mobile)"]
area: "5 Application shell and navigation components"
available_on: ["web", "desktop", "mobile", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "n/a", vscode: "built", chrome: "n/a"}
verification: {web: "partly seen (1 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S5.24", "S5.25", "S5.38", "S5.39"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "mode:cloud", "SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-sync-and-continuity", "SYS-shared-ui-and-design", "file:apps/web/app/open/[target]/[id]/page.tsx", "table:web_conversations", "table:cloud_agent_runs", "table:scheduled_tasks"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F005-07 Breadcrumbs, back and forward, and links

Lets a person step back and forward through screens, open a shared link to a chat, file, artifact, Work session, research report, schedule or browser task, and see a clear screen when something is loading or cannot be opened. Web relies on the browser; desktop adds menu and title-strip controls; mobile has a go-back hook. Breadcrumbs are not built.

Area: [5. Application shell and navigation components](README.md). Requirement items: [S5.24](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s524), [S5.25](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s525), [S5.38](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s538), [S5.39](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s539).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | partly seen (1 of 3) |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Moves through screen history, resolves a stable /open/<target>/<id> link to the right screen in AGI Workforce Web (and the Desktop window that shows it), and shows loading, not-found or unavailable screens when a link or route cannot be shown. Mobile has its own back hook and a 404 screen. VS Code can copy a link to a session.

**Why it exists.** People share links to work and expect them to open the right item, or explain why not. They also expect Back and Forward to behave. The brief asks for stable resource links (S5.38), back and forward (S5.25), breadcrumbs (S5.24) and loading or unavailable screens (S5.39).

**Who uses it.** Any signed-in person using Web, Desktop or Mobile; people who receive a link from a notification, a teammate or another app; VS Code users who copy a session link.

**Problems it solves**

- A link to a deleted, expired or someone else's item gives a clear reason instead of a blank page.
- A signed-out person is sent to sign in and returned to the link afterwards.
- A phone screen opened from a link with no history still has a way back.

**Use cases**

- Click a notification that points at a chat: it opens /open/chat/<id>, which redirects to the chat.
- Open a link to a schedule that has ended: the page says it has ended and offers Open Scheduled.
- On desktop (macOS) press the Back control beside the window buttons to return to the previous screen.
- On a phone, open a screen from a link with no history and tap the header back: it goes to the fallback screen.

## 2. User experience

**Where to find it**

- Web: browser Back and Forward; the /open/<target>/<id> address (apps/web/app/open/[target]/[id]/page.tsx:1). No in-app Back/Forward control for a plain browser was found [inferred].
- Desktop: menu 'History' with items 'Back' and 'Forward' (apps/desktop/electron/appMenu.ts:417-422); on macOS, back, forward and new-chat buttons in the title strip (apps/web/features/desktop-host/components/DesktopHistoryControls.tsx:62-80).
- Mobile: header back action built on useGoBack (apps/mobile/src/shared/hooks/useGoBack.ts:1-16); 'Page Not Found' screen with a 'Go Home' button (apps/mobile/app/+not-found.tsx:15-27).
- VS Code: a session receipt item 'Copy a link to this session' (apps/extension-vscode/src/features/sidebar-webview/sessionReceipt.ts:74-79).
- CLI and Chrome: not applicable per the brief; nothing opened.

**Before you start**

- Web and Desktop: a signed-in account; a signed-out visit is sent to /login (apps/web/app/open/[target]/[id]/page.tsx:27-29).
- Desktop title-strip controls: macOS and a shell that exposes window history (DesktopHistoryControls.tsx:57-65).
- A link target from this list: chat, file, artifact, work, research, schedule, browser-task (packages/contracts/types/src/product-links.ts:1-9).

**Screens and controls**

- Link-unavailable screen: heading, explanation, and one button whose label depends on the target: 'Back to chats', 'Open Library', 'Open Work history', 'Open Scheduled' (apps/web/features/notifications/components/ProductLinkUnavailable.tsx:15-23).
- Chat loading screen: 'Loading chat' (apps/web/app/chat/loading.tsx:3-4).
- Chat not-found screen: 'Conversation not found', 'It may have been deleted, or you no longer have access.', link 'Start a new chat' (apps/web/app/chat/not-found.tsx).
- Mobile 404 screen: '404', 'Page Not Found', 'The page you are looking for does not exist.', button 'Go Home' (apps/mobile/app/+not-found.tsx).

**Journey**

1. 1. Someone follows a link of the form /open/<target>/<id>.
2. 2. The server checks the target and id shape; a bad one shows the not-found page (page.tsx:23).
3. 3. If not signed in, the person goes to /login with a return address and comes back after sign in (page.tsx:27-29).
4. 4. The server looks the item up for this person and workspace (product-link-resolver.ts:186-209).
5. 5. If ready, the browser is redirected to the real screen (page.tsx:39).
6. 6. Otherwise the app shell shows the unavailable screen with a way back (page.tsx:41-45).

**What the person sees and gets**

- Unavailable titles: 'This <noun> was deleted', 'This <noun> has ended', 'You don’t have access to this', 'This <noun> isn’t available' (ProductLinkUnavailable.tsx:27-55).
- Page title 'Opening link', not indexed by search engines (page.tsx:12-15).
- Mobile: back goes to the previous screen, or to a fallback address when no history exists (useGoBack.ts:8-15).

**Settings**

- Desktop: the Back and Forward shortcuts are 'CommandOrControl+[' and 'CommandOrControl+]' (packages/contracts/local-runtime/src/host-bridge.ts:266-267).
- No user setting for links was found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web /open route validates target and id, redirects signed-out people to login, resolves the item and redirects or shows the unavailable screen (apps/web/app/open/[target]/[id]/page.tsx:20-45).
- Resolver covers chat, work, browser-task, research, schedule, file and artifact, returning ready, deleted, expired, unauthorized or not_found (apps/web/lib/services/product-link-resolver.ts:43-209).
- Desktop History menu Back/Forward call the window history when it can go back or forward (apps/desktop/electron/main.ts:2376-2383; appMenu.ts:417-422).
- Desktop falls back to the app root when a restored route answers not-found (apps/desktop/electron/main.ts:1222-1231).
- Desktop queues incoming deep links until the window can receive them and registers the protocol (apps/desktop/electron/main.ts:721-727, 836-840, 2574-2585).
- Mobile useGoBack with fallback and a 404 screen (useGoBack.ts; +not-found.tsx).
- Web chat loading and not-found screens exist (apps/web/app/chat/loading.tsx; not-found.tsx).

**Incomplete**

- Breadcrumbs: the brief marks S5.24 missing on web and desktop; no breadcrumb component was searched for beyond the brief (doc: knowledge-base/data/area-briefs/005-application-shell-and-navigation-components.md S5.24).
- The /open route checks a Personal scope only: it binds no organization (page.tsx:31-37), so a link to an item in a team workspace is likely to show 'unauthorized' or 'not found' [inferred from resolver SQL requiring organization match, product-link-resolver.ts:87-91].

**Present but disconnected or switched off**

- Unknown: how a mobile universal link reaches the in-app route; apps/mobile/app.config.js:60 cited by the brief was not found to hold link settings in the lines read.

**Not available**

- Breadcrumbs on web and desktop.
- Back/Forward and link opening on CLI and Chrome (brief lists no status for them).
- Web-page Back/Forward buttons inside the app for plain browsers: none found [inferred].

## 4. Required behaviour

**Established requirements**

- Nested app views show a breadcrumb trail back to their parents (e.g. Projects / Project / Chat). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.24)
- Back and forward navigation move through the user's in-app history. (source: S5.25 Should (same brief))
- Each resource (conversation, project, task) has a stable link that opens it directly in the app. (source: S5.38 Should (same brief))
- Routes show a loading state while resolving and a clear not-found/unavailable screen for missing or forbidden resources. (source: S5.39 Should (same brief))

**Acceptance criteria**

1. Opening /open/chat/<id of own live chat> while signed in lands on /chat/<id>.
2. Opening it while signed out goes to /login and returns to the same /open link after sign in.
3. An unknown target or an id with illegal characters shows the not-found page.
4. A deleted chat, an ended schedule, someone else's item and a missing item show four different titles.
5. Each unavailable screen has a working button back to a valid screen.
6. On macOS desktop, Back and Forward in the History menu move the window history; disabled paths do nothing.
7. On mobile, back with no history lands on the fallback screen.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Opening a link to an item in a team workspace should work after switching workspace; today the route reads Personal only [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Build breadcrumbs for nested views (Projects / Project / Chat) on web and desktop.
- [proposed] Let /open resolve the person's current workspace instead of Personal only.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | ProductLinkRoute | `apps/web/app/open/[target]/[id]/page.tsx` | Validates link, enforces sign in, resolves, redirects or shows unavailable screen |
| service | resolveProductLink | `apps/web/lib/services/product-link-resolver.ts` | Looks up each target type and returns ready or an unavailable state |
| component | ProductLinkUnavailable | `apps/web/features/notifications/components/ProductLinkUnavailable.tsx` | Unavailable screen copy and return button |
| other | product link helpers | `packages/contracts/types/src/product-links.ts` | Targets list, id rules, path builder and parser |
| screen | ChatLoading | `apps/web/app/chat/loading.tsx` | Route loading screen for chat |
| screen | ChatNotFound | `apps/web/app/chat/not-found.tsx` | Not-found screen for chat |
| component | DesktopHistoryControls | `apps/web/features/desktop-host/components/DesktopHistoryControls.tsx` | Back, forward and new chat buttons in the desktop title strip |
| command | historyMenu | `apps/desktop/electron/appMenu.ts` | History menu with Back and Forward |
| service | goBack/goForward | `apps/desktop/electron/main.ts` | Calls window history back and forward |
| service | deep link queue | `apps/desktop/electron/deepLinkQueue.ts` | Holds links until the window can receive them |
| other | deepLinkDestination | `apps/web/features/desktop-host/lib/deep-links.ts` | Maps a desktop deep link to an in-app path |
| config | host shortcuts | `packages/contracts/local-runtime/src/host-bridge.ts` | Defines host-back and host-forward shortcuts |
| hook | useGoBack | `apps/mobile/src/shared/hooks/useGoBack.ts` | Mobile back with fallback route |
| screen | NotFoundScreen | `apps/mobile/app/+not-found.tsx` | Mobile 404 screen |
| service | nativeRouteForProductLink | `apps/mobile/src/features/notifications/productLinks.ts` | Maps a product link to a mobile route (imported by accountFeed.ts:14-18; body not read) |
| component | session receipt link | `apps/extension-vscode/src/features/sidebar-webview/sessionReceipt.ts` | Builds 'Copy a link to this session' item |
| table | web_conversations | `apps/web/lib/services/product-link-resolver.ts` | Chat lookup and deleted check |
| table | cloud_agent_runs | `apps/web/lib/services/product-link-resolver.ts` | Work and browser-task lookup |
| table | scheduled_tasks | `apps/web/lib/services/product-link-resolver.ts` | Schedule lookup and expiry check |
| test | product-link-resolver tests | `apps/web/lib/services/__tests__/product-link-resolver.test.ts` | Resolver cases |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person opens an /open link; Web checks target and id shape | our servers | apps/web/app/open/[target]/[id]/page.tsx:20-24 |
| Gets the signed-in user's scoped database handle; if none, redirect to /login with return address | our servers | page.tsx:26-29 |
| Resolver queries the owning table for this user and no workspace; if absent, checks whether the id exists for another account to answer unauthorized vs not_found | our servers | product-link-resolver.ts:35-47, 186-209 |
| Ready: redirect to the real screen; otherwise render the unavailable screen inside the app shell | our servers | page.tsx:39-45 |
| Desktop Back/Forward: menu click calls the window's own history | device | apps/desktop/electron/main.ts:2376-2383 |
| Mobile back: router goes back or navigates to the fallback | device | apps/mobile/src/shared/hooks/useGoBack.ts:8-15 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Link target and id (in the URL) | not stored; read from the address | no | nothing kept |
| Queued desktop deep links | a file at the path from deepLinkQueuePath on the device (apps/desktop/electron/main.ts:803,727) | no | emptied when delivered (main.ts:838-839); freshness limit in deepLinkQueue.ts, not read |

**Models and providers.** No model or provider takes part. The lookup is database reads only. The resolver reads the same account data regardless of mode:local, mode:own-key or mode:cloud, but the /open route needs our servers and a signed-in account.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web /open needs a signed-in account; otherwise redirect to login (page.tsx:26-29). Mobile 404 and back need none. |
| Permissions | The item must belong to the person (user id match) and Personal scope; another account's item shows 'You don’t have access to this' (product-link-resolver.ts:43-47; ProductLinkUnavailable.tsx:42-47). |
| Subscription | none found in the code |
| Limits and metering | none found in the code for the route; link ids are limited to 128 characters of letters, digits and . _ : - (product-links.ts:25-26). |
| Feature flags | none found in the code for /open. |
| Model compatibility | not applicable |
| Provider restrictions | not applicable |
| Local mode | A Local-only chat has no server record, so a /open link to it cannot resolve on Web [inferred from the resolver reading server tables only]. Desktop and mobile Back/Forward and the 404 screen work offline on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | Chat route shows 'Loading chat'. The /open route has no separate loading screen; it is a server redirect (not handled in the code beyond that). | apps/web/app/chat/loading.tsx:3-4 |
| deleted | Title 'This chat was deleted'; files and artifacts point to Recently deleted in Library | ProductLinkUnavailable.tsx:27-35 |
| expired schedule | 'This schedule has ended' | product-link-resolver.ts:140-148 |
| temporary chat | Treated as not found | product-link-resolver.ts:99 |
| browser-task not from Chrome | Not found | product-link-resolver.ts:80-82 |
| malformed link | Not-found page; undecodable id is rejected | page.tsx:18-24 |
| no history on mobile | Navigates to fallback | useGoBack.ts:11-14 |
| desktop route answers not-found | Window goes to the app root | main.ts:1224-1231 |
| offline / timeout / retry on /open | not handled in the code reviewed | apps/web/app/open/[target]/[id]/page.tsx has no offline or retry branch |
| accessibility | Unavailable screen is a section with a heading and a link; desktop buttons carry aria-label with shortcut | ProductLinkUnavailable.tsx:73-81; DesktopHistoryControls.tsx:41-44 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/product-link-resolver.test.ts`: Resolver outcomes by target
- `apps/web/features/notifications/components/__tests__/ProductLinkUnavailable.test.tsx`: Unavailable screen copy and links
- `apps/web/features/desktop-host/__tests__/DesktopHistoryControls.test.tsx`: Desktop history controls (file exists; contents not read)
- `apps/web/features/desktop-host/__tests__/HostNavigation.test.tsx`: Host navigation (contents not read)
- `apps/mobile/src/shared/hooks/__tests__/useGoBack.test.tsx`: Mobile back hook
- `apps/desktop/electron/__tests__/appMenu.test.ts`: Menu structure
- `apps/desktop/electron/__tests__/deepLinkQueue.test.ts`: Deep link queue
- `apps/desktop/electron/__tests__/deepLink.test.ts`: Deep link parsing

**Test scenarios**

- **Own chat link**
  1. Sign in on Web
  2. Open /open/chat/<id of a live chat>
  - Expected: Redirects to /chat/<id>
- **Signed-out link**
  1. Sign out
  2. Open /open/chat/<id>
  - Expected: Login page; after sign in you land on the chat
- **Four unavailable states**
  1. Open links to a deleted chat, an ended schedule, another account's chat and a random uuid
  - Expected: Four different titles; each button leads to a valid page
- **Bad link**
  1. Open /open/chat/!!
  2. Open /open/nothing/<uuid>
  - Expected: Not-found page both times
- **Desktop history**
  1. On macOS desktop open two chats
  2. Press Back then Forward from the History menu
  - Expected: Window moves between them
- **Mobile no-history back**
  1. Open a screen from a link with no previous screen
  2. Tap back
  - Expected: Lands on the fallback screen

**Where to look when it fails**

- Server logs for the /open route and resolver; desktop recordDesktopEvent entries for failed loads (apps/desktop/electron/main.ts:1330-1333).
- Tables to check: web_conversations.deleted_at, scheduled_tasks.expires_at/status, cloud_agent_runs.origin_surface.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/web/005-application-shell-and-navigation-components.md)
- Desktop: [70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md)
- Mobile: [70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md)
- VS Code: [70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md)

## 10. Gaps and dependencies

- **Breadcrumbs not built** Affects: Web and Desktop. Evidence: S5.24 status in the brief. Work needed: Design and build a breadcrumb trail for nested views
- **/open reads Personal scope only** Affects: People with team workspaces on Web and Desktop. Evidence: page.tsx:31-37. Work needed: Resolve against the person's workspace or try each workspace
- **No Back/Forward control on web outside Desktop macOS** Affects: Web users in a browser with no browser buttons (e.g. installed web app). Evidence: DesktopHistoryControls.tsx:57-65 draws only on macOS desktop. Work needed: Decide whether the shell needs its own control [proposed]
- **Link opening not documented for CLI and Chrome** Affects: CLI and Chrome. Evidence: Brief has no status for them. Work needed: Decide if links should open in these apps

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- mode:cloud
- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-sync-and-continuity
- SYS-shared-ui-and-design
- file:apps/web/app/open/[target]/[id]/page.tsx
- table:web_conversations
- table:cloud_agent_runs
- table:scheduled_tasks

## Unknown

- Whether CLI or Chrome handle /open links.
- How mobile universal links map to routes (app.config.js:60 not confirmed).
- Contents of DesktopHistoryControls and HostNavigation tests.
- Whether web has any in-app Back control outside macOS desktop.
- Freshness window of the desktop deep link queue.

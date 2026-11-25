---
id: "F069-09"
type: "feature"
title: "Install and offline"
aliases: ["Install and offline", "Installable web app", "PWA manifest", "Offline notice", "Offline indicator", "/offline page", "S69.14", "S69.15"]
area: "69 Web application"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S69.14", "S69.15"]
depends_on: ["surface:web", "mode:cloud", "file:apps/web/app/manifest.ts", "file:apps/web/proxy.ts", "file:apps/web/public/sw.js", "store:localStorage agi_offline_queue", "SYS-sync-and-continuity", "SYS-shared-ui-and-design", "SYS-chat-turn-pipeline"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F069-09 Install and offline

The web app ships an install manifest (standalone, icons, start at '/'), signed-in visitors land in chat, and a notice shows when the connection drops. The composer refuses to send offline and keeps the draft. The service worker caches nothing, so no offline reading. An /offline page exists but nothing leads to it. The brief marks both items n/a.

Area: [69. Web application](README.md). Requirement items: [S69.14](../../10-requirements/capabilities/069-web-application.md#s6914), [S69.15](../../10-requirements/capabilities/069-web-application.md#s6915).

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

**What it does.** Lets the site be installed from the browser and tells the user when they are offline, without losing the draft (apps/web/app/manifest.ts:4-30; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:717,3588-3590).

**Why it exists.** An installed app should open the working product, and a dropped connection should be explained, not silent (S69.14, S69.15 should-lines).

**Who uses it.** Web users on desktop and phone browsers.

**Problems it solves**

- Opening the product from the home screen or dock.
- Sending a message with no network and losing the text.
- Not knowing why nothing happens.

**Use cases**

- Install from the browser menu and open straight into chat.
- Lose Wi-Fi mid-draft; read the notice; reconnect and send.
- Open /offline to see a plain explanation.

## 2. User experience

**Where to find it**

- Install: the browser's own install or add-to-home-screen action. No in-app install button or prompt handler found (search for beforeinstallprompt, no hits in apps/web).
- Offline notice: banner under the header, aria-label 'Network status indicator' (apps/web/shared/components/OfflineIndicator.tsx:128-140).
- Composer notice: 'You are offline. Your draft is saved here and can be sent after you reconnect.' (ChatComposerNew.tsx:717).
- Page /offline titled 'No connection' (apps/web/app/offline/page.tsx:12-18).

**Before you start**

- A browser that supports install for the manifest.
- Signed in to land in chat from '/' (apps/web/proxy.ts:124-129,208).

**Screens and controls**

- Offline banner with Retry when sync errors and an 'N pending' count (OfflineIndicator.tsx:148-175).
- /offline page: heading "You're offline.", text, 'Retry' button reloading the page (apps/web/app/offline/OfflineStatus.tsx).
- Composer send blocked with a reason while offline (ChatComposerNew.tsx:4806).

**Journey**

1. Install from the browser menu; launch opens '/' standalone.
2. Signed in: '/' is rewritten to the chat root; signed out sees the marketing page.
3. Connection drops: banner appears; composer shows the offline reason.
4. Type a draft; pressing send shows the notice and sends nothing.
5. Connection returns: press send.

**What the person sees and gets**

- Banner text from the sync manager status (apps/web/lib/offline/offlineSync.ts:46-52).
- Composer notice text above.

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Manifest with name, short name, description, standalone, colours, three icons, start_url '/' (apps/web/app/manifest.ts:4-30).
- Signed-in '/' rewrites to chat (apps/web/proxy.ts:124-129,208).
- Composer tracks online state, refuses send, keeps draft (ChatComposerNew.tsx:842,3588-3590,4806).
- OfflineIndicator mounted for the whole app (apps/web/app/AppRuntimeMounts.tsx:25).

**Incomplete**

- Previously loaded content is not readable offline: the only worker caches nothing and intercepts no fetches (apps/web/public/sw.js:1-8).
- Offline queue module exists (localStorage key agi_offline_queue) but no producer was found: queueMessage and queueToolExecution have no importer outside lib/offline and tests (search of apps/web). The earlier idea that the Code feature enqueues into it is wrong: use-local-session uses its own queue from client-runtime/queue (apps/web/features/code/hooks/use-local-session.ts:4,221).

**Present but disconnected or switched off**

- /offline page exists and is listed in an e2e contrast spec (apps/web/e2e/qa-14-public-route-contrast.spec.ts:106) but no link, redirect or worker fallback leads to it.

**Not available**

- Offline read-only content; offline navigation fallback; in-app install prompt; mobile, desktop, CLI, extensions (not this feature).

## 4. Required behaviour

**Established requirements**

- The site can be installed as a standalone web app whose launch opens the working product. (source: S69.14 (brief))
- When the connection drops the app says so, previously loaded content stays readable, with an offline page for navigations. (source: S69.15 (brief))
- The only worker deliberately caches nothing, because a cache would shadow streaming responses. (source: apps/web/public/sw.js:1-8)

**Acceptance criteria**

1. Browser offers install and the installed app opens chat for a signed-in user.
2. Going offline shows a status banner.
3. Send offline shows the offline reason and keeps the text.
4. After reconnecting, the same draft sends.
5. /offline renders without sign-in.
6. Before claiming S69.15, loaded chats must be readable offline (currently fails).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The brief marks both items n/a but code ships a manifest and notice; status needs updating to partial.
- [inferred] Next serves app/manifest.ts as the manifest by file convention.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Either wire /offline into a worker fallback or remove it.
- [proposed] Remove the unused offline queue or connect chat to it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | manifest | `apps/web/app/manifest.ts` | Install metadata |
| config | proxy home rewrite | `apps/web/proxy.ts` | Signed-in '/' goes to chat |
| other | service worker | `apps/web/public/sw.js` | Push only; no caching |
| component | OfflineIndicator | `apps/web/shared/components/OfflineIndicator.tsx` | Banner for offline, syncing, error, pending |
| component | AppRuntimeMounts | `apps/web/app/AppRuntimeMounts.tsx` | Mounts the indicator |
| service | offlineSync | `apps/web/lib/offline/offlineSync.ts` | Sync manager over shared client-runtime |
| service | offlineQueue | `apps/web/lib/offline/offlineQueue.ts` | localStorage queue with health probe; no producers |
| component | ChatComposerNew offline handling | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Online state, refuse send, keep draft |
| hook | useOnlineStatus | `packages/ui/unified-chat` | Shared online hook used by composer and /offline page |
| store | composer draft storage | `apps/web/features/chat/components/Composer/composer-draft-storage.ts` | Persists the unsent draft |
| screen | /offline page | `apps/web/app/offline/page.tsx` | No-connection explanation |
| component | OfflineStatus | `apps/web/app/offline/OfflineStatus.tsx` | Heading, summary, Retry, captive portal hint |
| endpoint | HEAD /api/health probe | `apps/web/lib/offline/offlineQueue.ts` | Online probe used by the queue |
| test | OfflineStatus test | `apps/web/app/offline/OfflineStatus.test.tsx` | Offline page copy |
| test | OfflineIndicator error test | `apps/web/shared/components/OfflineIndicator.error.test.tsx` | Indicator error state |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser reads the manifest and offers install. | device | apps/web/app/manifest.ts:4-30 [inferred browser behaviour] |
| Launch requests '/'; proxy rewrites signed-in visitors to chat. | our servers | apps/web/proxy.ts:124-129,208 |
| Composer reads online state; offline send is blocked with a notice. | device | ChatComposerNew.tsx:842,3588-3590 |
| Indicator starts the sync manager and shows state. | device | OfflineIndicator.tsx:30-47 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Unsent draft | Browser storage via composer-draft-storage | No | Until sent or cleared |
| Offline queue items | localStorage key agi_offline_queue | Would sync when online | No items are written today (no producer found) |

**Models and providers.** None. No model call happens offline; chat needs a model route, which is not available offline in any mode on web [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Install needs none; landing in chat needs a signed-in session. |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | Browser must support install; not controlled by us. |
| Local mode | Web has no local inference path in this feature; offline means no chat. Local inference lives on Desktop and Mobile. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Offline send | Notice, draft kept | ChatComposerNew.tsx:717,3588-3590 |
| Sync error | Banner with Retry | OfflineIndicator.tsx:148-160 |
| Reconnect | Banner shows 'Last synced'; composer send re-enabled | OfflineIndicator.tsx:138-141; ChatComposerNew.tsx:4806 [inferred] |
| Cold start offline | Browser error page; no worker fallback | apps/web/public/sw.js:1-8 |
| Captive portal | /offline explains it | apps/web/app/offline/OfflineStatus.tsx |
| Accessibility | role=status and aria-live polite on banner and /offline | OfflineIndicator.tsx:128-130 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/offline/OfflineStatus.test.tsx`: Offline page copy, online/offline states, Retry reload
- `apps/web/shared/components/OfflineIndicator.error.test.tsx`: Indicator error state (name only)
- `apps/web/features/chat/components/Composer/ChatComposerNew.sendPending.test.tsx`: Matched a search for the offline reason text; scope not read

**Test scenarios**

- **Offline send**
  1. Open chat.
  2. Go offline in devtools.
  3. Type text, press send.
  - Expected: Offline notice, text kept, nothing sent.
- **Reconnect**
  1. Continue from the previous scenario, go online, press send.
  - Expected: Message sends.
- **Install**
  1. Open the site in a supporting browser.
  2. Install.
  3. Launch from the icon signed in.
  - Expected: Standalone window opens at chat.
- **Cold offline**
  1. Go offline, reload the chat page.
  - Expected: Browser error page (no offline fallback).
- **Offline route**
  1. Open /offline.
  - Expected: 'No connection' page renders.

**Where to look when it fails**

- Browser devtools, Application, Manifest and Service Workers.
- localStorage key agi_offline_queue.
- Logger '[OfflineQueue]' lines.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No offline read of loaded content.** Affects: All web users. Evidence: apps/web/public/sw.js:1-8. Work needed: Decide a cache design that does not break streaming, or change S69.15.
- **/offline page unreachable.** Affects: All web users. Evidence: no link or fallback; only an e2e spec lists it. Work needed: Wire or remove.
- **Offline queue has no producer.** Affects: Chat users. Evidence: search for queueMessage importers. Work needed: Connect chat or delete.
- **Brief status n/a disagrees with the code.** Affects: Planning. Evidence: manifest.ts and OfflineIndicator exist. Work needed: Update brief.
- **No in-app install prompt.** Affects: Users unaware of install. Evidence: no beforeinstallprompt hit. Work needed: Product decision.

**Depends on**

- surface:web
- mode:cloud
- file:apps/web/app/manifest.ts
- file:apps/web/proxy.ts
- file:apps/web/public/sw.js
- store:localStorage agi_offline_queue
- SYS-sync-and-continuity
- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline

## Unknown

- Install behaviour on each browser; no run recorded.
- Whether any user-visible link reaches /offline.
- Whether the indicator ever shows 'N pending' since no producer was found.
- How the composer notice clears after reconnect (not traced).
- Contents of ChatComposerNew.sendPending.test.tsx beyond a text match.

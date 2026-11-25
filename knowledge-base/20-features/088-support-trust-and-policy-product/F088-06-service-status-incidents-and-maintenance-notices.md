---
id: "F088-06"
type: "feature"
title: "Service status, incidents and maintenance notices"
aliases: ["Service status", "Status page", "Incident notices", "Maintenance notices", "Service notices", "Known issues (S88.09)", "System status", "Service Status"]
area: "88 Support, trust, and policy product"
available_on: ["web", "desktop", "mobile", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "partial", chrome: "missing"}
verification: {web: "partly seen (1 of 3)", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S88.09", "S88.10", "S88.11", "S88.12"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "api:GET /api/status/notices", "api:GET /api/health", "store:sessionStorage", "SYS-observability-and-operations", "SYS-api-and-contracts", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F088-06 Service status, incidents and maintenance notices

A public status page (/status) shows hosted health checks. On web and the desktop window, a banner appears when chat or billing is failing, shortly after recovery, and for planned maintenance (72 hours ahead). Mobile and VS Code only link to the status page. CLI and Chrome have nothing. Known-issue lists do not exist.

Area: [88. Support, trust, and policy product](README.md). Requirement items: [S88.09](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8809), [S88.10](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8810), [S88.11](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8811), [S88.12](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8812).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | partly seen (1 of 3) |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** The server turns cached health checks and a configured maintenance window into a list of notices at GET /api/status/notices; the web app reads it every 5 minutes and on window focus and shows banners with a link ('Status' or 'Details') (apps/web/app/api/status/notices/route.ts, apps/web/shared/components/ServiceNotices.tsx:95-134).

**Why it exists.** Users see current status, incident and maintenance notices inside the product (doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md, S88.10 to S88.12).

**Who uses it.** Every web or desktop user during an incident; operators who set the maintenance window.

**Problems it solves**

- People cannot tell a service outage from their own problem.
- Planned downtime surprises users.
- A restored service is not announced as fully recovered too early (message says it is still being monitored: apps/web/lib/server/service-notices.ts:103-107).

**Use cases**

- Sign-in or the chat database fails and a red banner says the product is having a problem.
- Stripe-backed billing fails and a billing banner appears only on the billing surfaces.
- An operator sets a maintenance window and users see a notice 72 hours ahead.
- A phone user taps 'Service Status' in About.

## 2. User experience

**Where to find it**

- Web and desktop window: a notice stack at the top of the product (apps/web/app/AppRuntimeMounts.tsx:28, apps/web/shared/components/ProductNotices.tsx:12-19). Billing notices appear on the pricing page, the Billing settings section and the upgrade dialog (apps/web/app/pricing/page.tsx:979, apps/web/features/settings/sections/BillingSection.tsx:722, apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:504).
- Web: Settings, Help, link 'System status' (apps/web/features/settings/sections/HelpSection.tsx:55-60); /status page; /maintenance page; chat error notice link 'Status' for image failures and provider-not-configured (apps/web/features/chat/pages/WebChatPage.tsx:6890-6900); marketing nav 'Status'.
- Mobile: About screen, Support card, row 'Service Status' opens https://agiworkforce.com/status (apps/mobile/app/(app)/about.tsx:279-283). No in-app notices.
- VS Code: Help menu '$(pulse) Service status' (apps/extension-vscode/src/features/help/helpMenu.ts:31-35).
- CLI and Chrome: none found.
- Desktop: no separate status menu item found in apps/desktop/electron/appMenu.ts help menu.

**Before you start**

- None to view /status or the notice endpoint (public).

**Screens and controls**

- Notice card with message, a button 'Status' (incident) or 'Details' (maintenance) and a dismiss control (apps/web/shared/components/ServiceNotices.tsx:114-131, apps/web/lib/server/service-notices.ts:66-67,164-165).
- Status page: heading 'Service status', health state labels (Healthy, Degraded, Core check failing, Stale result, Checks unavailable), the list of what is not covered, restoration lines (apps/web/app/status/page.tsx:50-62,199-260).

**Journey**

1. 1. A health check fails or a maintenance window is configured.
2. 2. The next read of /api/status/notices includes a notice.
3. 3. The banner appears (within 5 minutes of the change, or on focus).
4. 4. The person clicks 'Status' or 'Details' to read more, or dismisses the notice.
5. 5. After recovery, a 'working again... monitoring' notice shows for about an hour.

**What the person sees and gets**

- Product incident text: '<Brand> is having a problem right now, and some requests may fail. We are working on it.' Billing incident text and restored texts (apps/web/lib/server/service-notices.ts:92-107).
- Maintenance texts with UTC times, 'New chats are paused' wording (apps/web/lib/server/service-notices.ts:63-65).

**Settings**

- Server configuration names: AGI_MAINTENANCE_WINDOW (format start/end as two timestamps separated by a slash; apps/web/lib/service-notices/maintenance-window.ts:6-16, apps/web/lib/server/service-notices.ts:212) and AGI_STATUS_MIRROR_URL for an out-of-band status mirror (apps/web/lib/server/incident/out-of-band.ts:9,88-90).
- Users: dismiss only.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: notice list built from health (chat-blocking checks: database, chat, identity; identity configuration; shared store when fail-closed) and billing health (apps/web/lib/server/service-notices.ts:22-24,71-90).
- Web: 3 second limit on the health read; a slower answer is treated as no answer and no incident is shown (apps/web/lib/server/service-notices.ts:18,181-193,195-197).
- Web: recovery notice for 60 minutes after the last failing read, held in the key-value store (apps/web/lib/server/service-notices.ts:19,129-155).
- Web: maintenance notice from the window, from 72 hours before until it ends (apps/web/lib/server/service-notices.ts:17,47-69).
- Web: banner reads every 5 minutes and on window focus; dismissals in sessionStorage per tab session; dismissals dropped when the notice leaves the feed (apps/web/shared/components/ServiceNotices.tsx:12-14,75-80,101-108).
- Web: /status page with cached health result and a 4 second read limit (apps/web/app/status/page.tsx:65-90).
- Public /api/health route returns redacted checks, 503 when unhealthy or stale (apps/web/app/api/health/route.ts:81-112).
- Desktop: shows the same web app, so notices appear [inferred from AGENTS.md section 5; not run].
- Mobile About 'Service Status' and VS Code 'Service status' links work as links (files above).

**Incomplete**

- Mobile, VS Code, CLI, Chrome: no in-app incident or maintenance notices (brief S88.10 to S88.12 missing).
- Status page says it does not cover model inference, individual provider routes, or desktop, mobile, extension and CLI surfaces (apps/web/app/status/page.tsx:236-243).

**Present but disconnected or switched off**

- Maintenance notices appear only when AGI_MAINTENANCE_WINDOW is set; otherwise none (apps/web/lib/server/service-notices.ts:211-213,235-238).
- Where 'new chats are paused' is enforced during maintenance was not traced (function maintenanceUnderway exists: apps/web/lib/server/service-notices.ts:215-218).

**Not available**

- Known-issue list: no code found in any app (grep for 'known issue' in apps/web app, features and content found nothing; brief S88.09 missing).

## 4. Required behaviour

**Established requirements**

- Users can see current service status from the product, fed by live health checks. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S88.10)
- During an incident, users see a notice in the product describing the problem and its status. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S88.11)
- Users are told about planned maintenance before and during it, inside the product. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S88.12)
- The product shows a list of currently known issues with status or workaround. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S88.09)
- A health check that takes longer than 3 seconds is treated as no answer, so no incident notice is shown. (source: apps/web/lib/server/service-notices.ts:18,181-193)
- The notice list is read every 5 minutes and on window focus. (source: apps/web/shared/components/ServiceNotices.tsx:12,101-108)

**Acceptance criteria**

1. With the chat database check failing, /api/status/notices returns an incident notice with scope 'product' and link '/status'.
2. With only billing failing, the notice has scope 'billing' and does not show in the product-wide stack.
3. With a window starting in 48 hours, a maintenance notice with 'Details' linking /maintenance is returned; with one starting in 80 hours, none.
4. A dismissed notice stays hidden after reload in the same browser session and returns in a new session.
5. If the health read takes over 3 seconds, no incident notice is returned.
6. After a failing check clears, a 'working again' notice appears for about an hour.
7. The mobile About 'Service Status' row opens the status page.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Local and own-key chats run on the device or a provider directly, so a hosted outage banner may be misleading for them; the status page says Local and BYOK work does not depend on our servers (apps/web/app/status/page.tsx:243-246) [inferred relevance].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the same notice feed in mobile, CLI, VS Code and Chrome.
- [proposed] Add a known-issues list with status and workaround, owned by one content source.
- [proposed] Hide hosted-outage banners for chats that use Local mode.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | readServiceNotices | `apps/web/lib/server/service-notices.ts` | Builds incident, recovery and maintenance notices. |
| endpoint | GET /api/status/notices | `apps/web/app/api/status/notices/route.ts` | Returns the notice list, cached 60 seconds at the edge. |
| schema | ServiceNotice schema | `packages/contracts/cloud-contracts/src/service-notices.ts` | Path, scopes (product, billing), notice shape. |
| service | maintenance-window | `apps/web/lib/service-notices/maintenance-window.ts` | Parses AGI_MAINTENANCE_WINDOW. |
| service | health-check | `apps/web/lib/server/health-check.ts` | Cached health results used by notices and the status page. |
| endpoint | GET /api/health | `apps/web/app/api/health/route.ts` | Public redacted readiness endpoint. |
| component | ServiceNotices | `apps/web/shared/components/ServiceNotices.tsx` | Reads the feed, filters by scope, handles dismissals. |
| component | ProductNotices | `apps/web/shared/components/ProductNotices.tsx` | Stack with scope 'product'. |
| component | AppRuntimeMounts | `apps/web/app/AppRuntimeMounts.tsx` | Mounts ProductNotices for the app. |
| screen | Status page | `apps/web/app/status/page.tsx` | Public status and recoveries. |
| screen | Maintenance page | `apps/web/app/maintenance/page.tsx` | Target of the 'Details' link. |
| service | out-of-band status mirror | `apps/web/lib/server/incident/out-of-band.ts` | Status mirror URL (AGI_STATUS_MIRROR_URL). |
| store | key-value store (recovery state) | `apps/web/lib/server/key-value.ts` | Keeps the last failing time per scope for 60 minutes. |
| store | sessionStorage agi-dismissed-service-notices | `apps/web/shared/components/ServiceNotices.tsx` | Dismissals for the tab session. |
| component | Settings HelpSection | `apps/web/features/settings/sections/HelpSection.tsx` | 'System status' link. |
| component | WebChatPage turn notice | `apps/web/features/chat/pages/WebChatPage.tsx` | 'Status' link on some failures (line 6897). |
| screen | Mobile About | `apps/mobile/app/(app)/about.tsx` | 'Service Status' row. |
| command | VS Code help menu | `apps/extension-vscode/src/features/help/helpMenu.ts` | 'Service status' link. |
| test | service-notices tests | `apps/web/lib/server/__tests__/service-notices.test.ts` | Server notice logic. |
| test | ServiceNotices component test | `apps/web/shared/components/__tests__/ServiceNotices.test.tsx` | Scope and dismissal behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser requests GET /api/status/notices on mount, every 5 minutes and on window focus. | device | apps/web/shared/components/ServiceNotices.tsx:82-108 |
| Server reads cached health checks, racing a 3 second timer; no answer means no incident notices. | our servers | apps/web/lib/server/service-notices.ts:181-197 |
| Server decides which scopes are blocked, records last failing time in the key-value store and reads recovery state. | our servers | apps/web/lib/server/service-notices.ts:118-155,195-204 |
| Server adds a maintenance notice if the configured window is within 72 hours or under way. | our servers | apps/web/lib/server/service-notices.ts:47-69,234-238 |
| Response is cacheable at the edge for 60 seconds (stale 60). | our servers | apps/web/app/api/status/notices/route.ts:11-13 |
| Client validates the list, drops stale dismissals, filters by scope and shows banners. | device | apps/web/shared/components/ServiceNotices.tsx:82-93,110-133 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Last failing time per scope | Key-value store key 'agi-service-notice:last-failing:<scope>' with 60 minute lifetime | Server-side only | Expires after 60 minutes (apps/web/lib/server/service-notices.ts:19-20,139-141) |
| Dismissed notice ids | Browser sessionStorage key 'agi-dismissed-service-notices' | No | Cleared when the browser session ends or the notice leaves the feed |

**Models and providers.** No model takes part. The 'chat' health check does not test model inference or a user chat turn (apps/web/app/status/page.tsx:51-53), so a model provider outage does not by itself raise a notice [inferred from the status text].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None for notices or status; the endpoint has no auth call (apps/web/app/api/status/notices/route.ts). |
| Permissions | None found in the code. |
| Subscription | None found in the code. Billing-scope notices appear only on billing surfaces. |
| Limits and metering | Client refresh 5 minutes; edge cache 60 seconds. /api/health uses the 'health-check' rate limit (apps/web/app/api/health/route.ts:82). No other limits found. |
| Feature flags | AGI_MAINTENANCE_WINDOW and AGI_STATUS_MIRROR_URL (names only). |
| Model compatibility | Not applicable. |
| Provider restrictions | None found in the code. |
| Local mode | Notices describe hosted services. The status page says Local and BYOK work runs on the device and does not depend on our servers (apps/web/app/status/page.tsx:243-246). Whether banners are hidden in desktop Local sessions is not shown in the files read, so unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Nothing shown until the feed loads (no spinner). | apps/web/shared/components/ServiceNotices.tsx:101-113 |
| Empty | No banner. | apps/web/shared/components/ServiceNotices.tsx:112 |
| Error reading the feed | Silent (meta silent); the old feed stays. | apps/web/shared/components/ServiceNotices.tsx:84-88,107 |
| Bad payload | Treated as an empty list. | apps/web/shared/components/ServiceNotices.tsx:89-90 |
| Health check slow or failing | No incident notice; status page shows 'Checks unavailable' or 'Stale result'. | apps/web/lib/server/service-notices.ts:181-197; apps/web/app/status/page.tsx:58-62 |
| Dismiss | Hidden for the session; a recurring incident with the same id stays hidden until it leaves the feed once. | apps/web/shared/components/ServiceNotices.tsx:70-80 |
| Storage blocked | Dismissals held in memory only. | apps/web/shared/components/ServiceNotices.tsx:32-55 |
| Refocus | Refetch on window focus. | apps/web/shared/components/ServiceNotices.tsx:106 |
| Offline | Not handled in ServiceNotices beyond a failed silent fetch; a separate OfflineIndicator is mounted by the app. | apps/web/shared/components/ServiceNotices.tsx:84-88; apps/web/app/AppRuntimeMounts.tsx:13,24 |
| Accessibility | The notice link button has a coarse-pointer minimum height; live-region behaviour of the notice card was not read. | apps/web/shared/components/ServiceNotices.tsx:121-126 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/__tests__/service-notices.test.ts`: Billing vs product scope, stable incident id, maintenance phases, no notice when health does not answer.
- `apps/web/lib/server/__tests__/service-notices.runtime.test.ts`: Runtime behaviour (contents not opened).
- `apps/web/shared/components/__tests__/ServiceNotices.test.tsx`: Scope filtering and dismissal persistence.
- `apps/web/app/api/status/notices/__tests__`: Notices route (folder exists; files not opened).
- `apps/web/app/status/__tests__/StatusPage.test.tsx`: Status page.
- `apps/web/app/status/__tests__/signal-view.test.ts`: Signal view.
- `apps/web/__tests__/api/health.test.ts`: Health route.
- `apps/web/e2e/status-first-screen.spec.ts`: Playwright status first screen (not opened).

**Test scenarios**

- **Product incident**
  1. Make the chat database check fail in a test build.
  2. Open the app and wait or refocus.
  - Expected: Red banner with 'Status' link; /status shows 'Core check failing'.
- **Billing incident**
  1. Fail the billing dependency.
  2. Open chat, then Settings, Billing.
  - Expected: No banner in chat; billing notice on the Billing section and pricing page.
- **Maintenance ahead**
  1. Set AGI_MAINTENANCE_WINDOW to start in 24 hours.
  2. Load the app.
  - Expected: Info notice with UTC times and 'Details' link to /maintenance.
- **Dismiss**
  1. Dismiss a notice.
  2. Reload.
  3. Open a new browser session.
  - Expected: Hidden after reload; visible again in the new session.
- **Slow health**
  1. Delay the health read beyond 3 seconds.
  - Expected: No incident notice.
- **Phone link**
  1. Open About on the phone app, tap 'Service Status'.
  - Expected: Status page opens in the browser.

**Where to look when it fails**

- Log 'Service incident recovery state could not be read or written' (apps/web/lib/server/service-notices.ts:152).
- GET /api/status/notices and GET /api/health responses.
- Key-value keys 'agi-service-notice:last-failing:*'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/088-support-trust-and-policy-product.md](../../70-qa/test-plans/web/088-support-trust-and-policy-product.md)
- Desktop: [70-qa/test-plans/desktop/088-support-trust-and-policy-product.md](../../70-qa/test-plans/desktop/088-support-trust-and-policy-product.md)
- Mobile: [70-qa/test-plans/mobile/088-support-trust-and-policy-product.md](../../70-qa/test-plans/mobile/088-support-trust-and-policy-product.md)
- VS Code: [70-qa/test-plans/vscode/088-support-trust-and-policy-product.md](../../70-qa/test-plans/vscode/088-support-trust-and-policy-product.md)

## 10. Gaps and dependencies

- **No known-issues list in any app.** Affects: All apps. Evidence: brief S88.09; no code found. Work needed: Define a content source, a page and in-app entry.
- **No in-app incident or maintenance notices on mobile, CLI, VS Code, Chrome.** Affects: Mobile, CLI, VS Code, Chrome. Evidence: brief S88.10-12; only links in apps/mobile/app/(app)/about.tsx:279-283 and apps/extension-vscode/src/features/help/helpMenu.ts:31-35. Work needed: Read /api/status/notices in each app.
- **Brief says mobile and VS Code status missing; both link to the status page.** Affects: Documentation accuracy. Evidence: same files. Work needed: Update the brief.
- **Brief cites the composer footer for a status link; line 406 is the model picker. The 'Status' link is in the chat turn notice.** Affects: Documentation accuracy. Evidence: apps/web/features/chat/pages/WebChatPage.tsx:6897. Work needed: Fix the anchor.
- **Incident notices do not cover model providers or inference.** Affects: All chat users. Evidence: apps/web/app/status/page.tsx:51-53,236-243. Work needed: Decide whether provider status belongs in notices.
- **Desktop notices not confirmed by a run.** Affects: Desktop. Evidence: inference only. Work needed: Drive the desktop app.
- Not built on: CLI, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- api:GET /api/status/notices
- api:GET /api/health
- store:sessionStorage
- SYS-observability-and-operations
- SYS-api-and-contracts
- SYS-execution-boundaries

## Unknown

- Where 'new chats are paused' during maintenance is enforced.
- Whether the desktop window shows the notice stack exactly as web (not run).
- Whether any mobile or CLI screen consumes /api/status/notices (grep found none).
- Who sets AGI_MAINTENANCE_WINDOW in production and how.
- Accessibility announcement behaviour of ProductNoticeCard (not read).

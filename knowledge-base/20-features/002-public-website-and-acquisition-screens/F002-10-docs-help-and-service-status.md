---
id: "F002-10"
type: "feature"
title: "Docs, help and service status"
aliases: ["Documentation portal", "/docs", "Help centre", "/help", "Help article", "/help/<slug>", "Service status", "/status", "Trust centre", "Trust and compliance status", "/trust", "S2.30", "S2.31", "S2.32", "S2.33"]
area: "2 Public website and acquisition screens"
available_on: ["web"]
implementation: {web: "built", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "seen working", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S2.30", "S2.31", "S2.32", "S2.33"]
depends_on: ["surface:web", "surface:mobile", "api:GET /api/help/search", "SYS-observability-and-operations", "SYS-security-and-privacy", "SYS-memory-projects-and-context", "SYS-subscriptions-entitlements-and-usage", "file:apps/web/lib/server/health-check.ts", "file:apps/web/content/support", "F002-07", "F002-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F002-10 Docs, help and service status

Four public web pages: /docs indexes guides and reference; /help offers keyword search and browse-by-collection of help articles, each at /help/<slug>; /status shows health checks reused for up to 60 seconds with their age; /trust lists dated security and compliance claims and says which certifications are not held.

Area: [2. Public website and acquisition screens](README.md). Requirement items: [S2.30](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s230), [S2.31](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s231), [S2.32](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s232), [S2.33](../../10-requirements/capabilities/002-public-website-and-acquisition-screens.md#s233).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen working |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives visitors guides, searchable help articles, an honest service-health view and a dated trust and compliance statement (apps/web/app/docs/page.tsx:140; apps/web/app/help/page.tsx; apps/web/app/status/page.tsx; apps/web/app/trust/page.tsx:280).

**Why it exists.** Self-service answers lower support load, and the status and trust pages must say plainly what is tested and what is not (status metadata: 'A passing check does not verify a model response'; trust lede: no SOC 2 report, ISO 27001 certificate or third-party penetration test).

**Who uses it.** Customers, evaluators, security reviewers, support staff and the in-product support surfaces that link here.

**Problems it solves**

- Find the right guide per surface and plan
- Search articles without an AI call
- See whether the service is up and which dependency fails
- Check the security posture with evidence names

**Use cases**

- A user searches 'usage limit' and finds the usage-and-credits article.
- A visitor opens /status during an incident and reads which check fails and when it last ran.
- A reviewer reads /trust and finds a control with its evidence document.
- A mobile user taps Help Center or Service Status in About and gets these web pages (apps/mobile/app/(app)/about.tsx:275-286).

## 2. User experience

**Where to find it**

- Web header Resources menu: Documentation, Status, Trust centre (nav.ts:129, 142, 150); footer Resources: Docs, Help, Support, Status (nav.ts:205-211).
- Mobile: Settings > About > Support: Help Center and Service Status open the web pages (about.tsx:275, 281).
- CLI, VS Code, Chrome, Desktop: none found as dedicated screens; the CLI error text links agiworkforce.com/support (apps/cli/src/errors.rs:1582).

**Before you start**

- None; all four are public.

**Screens and controls**

- /docs: title Documentation; sections Start here, Guides by surface, Reference, Browse by topic (docs/page.tsx:150-225).
- /help: hero 'Get unstuck, fast.' with a search box, collections ledger, buttons Read the FAQ, Get support, Email us (help/page.tsx).
- /help/<slug>: breadcrumb, title, Copy page button, meta (updated date, release state, audience, platforms, plans), body, feedback widget, related cards, previous and next (help/[slug]/page.tsx:100-178).
- /status: state heading, last check time, rows per check, method, mirror row, SLO rows, degradation table, incidents, report buttons 'Email an incident report' etc. (status/page.tsx:237-570).
- /trust: hero, 'Last updated ... Next review ...', What we hold, Control by control, Checks you can run yourself, documents behind the rows, changes (trust/page.tsx:44-52, 280-400).

**Journey**

1. Open /docs and choose a guide, or open /help.
2. Type at least 2 characters; results appear after a 250 ms pause (HelpSearch.tsx:24-25).
3. Open an article; use Copy page, give feedback, or follow related links.
4. Open /status to read the live signal; reload after a few seconds if it says stale.
5. Open /trust and follow the evidence names.

**What the person sees and gets**

- Search states: idle, searching, results, empty, unavailable (503) and error (HelpSearch.tsx:16-22, 52-60).
- Status state labels: 'Checks passing', 'Some checks failing', 'Core check failing', 'Stale result', 'Checks unavailable' (status/page.tsx:47-53).
- Trust shows last updated and next review dates (trust/page.tsx:36, 296-300).

**Settings**

- Operator: AGI_STATUS_MIRROR_URL shows a mirror link; otherwise the page says it is the only place status is published (status/page.tsx:237-246; out-of-band.ts:9, 88).
- Phone view: ?phone marker changes help and support content (help/page.tsx:36-42).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- /docs builds its topic index from the support corpus; if the corpus is unavailable it says so and still shows the fixed surface and reference guides (docs/page.tsx:148, 226; doc-index.ts:32).
- /help search calls GET /api/help/search: deterministic BM25 retrieval over published support content, no model call, rate limited, 503 when the corpus is not loaded (apps/web/app/api/help/search/route.ts:49-75).
- /help/<slug> pages are generated from the index; unknown slugs return not found (dynamicParams false) (help/[slug]/page.tsx:40-71).
- /status renders on every request but the health result is reused up to 60 seconds, read with a 4 second timeout, and marked stale after 120 seconds (status/page.tsx:45, 73, 92; render-cache.ts:37, 50; signal-view.ts:40). Probed checks: database, stripe, environment, chat, work, voice, search, vector, cache, email, identity (health-check.ts:410-423).
- Status shows SLO attainment, capability degradation, incident recoveries and a mirror link only when configured (status/page.tsx:237-246, 466; out-of-band.ts:88).
- /trust is static content with a machine-checked next-review date; a test fails when a row moved after its last review (trust/page.tsx:36; trust-claims-index.test.ts).

**Incomplete**

- Status 'live checks' are cached for up to a minute; the page says so, but a visitor sees the age, not a per-request probe (render-cache.ts:35-37).
- Trust claims depend on repository documents and tests; whether each evidence file exists was not checked.

**Present but disconnected or switched off**

- The status mirror is off unless AGI_STATUS_MIRROR_URL is set.

**Not available**

- No help search on Desktop or extension surfaces found.
- No chat-model probe: the status page states a chat turn is not tested (HEALTH_NOTE healthy, status/page.tsx:56-57).

## 4. Required behaviour

**Established requirements**

- A public documentation portal indexes guides and API docs. (source: brief S2.30)
- A public help centre offers searchable articles. (source: brief S2.31)
- A public service-status page shows current health from live checks. (source: brief S2.32)
- A public trust and security centre explains security posture and data handling. (source: brief S2.33)
- Status renders on every request and shows a mirror link; help articles are per slug; the trust page explains posture and data handling. (source: brief draft for F002-10; apps/web/app/status/page.tsx:45, 237)
- No certification is claimed that is not held. (source: apps/web/e2e/enterprise-surface.spec.ts 'no page claims a certification we do not hold')

**Acceptance criteria**

1. /docs lists every help article once and each link works.
2. Search with 1 character shows no request; 2 or more returns results or an empty message.
3. When the corpus is missing, search says unavailable, not 'no results'.
4. /status shows the check time and age, and says stale after 120 seconds.
5. With AGI_STATUS_MIRROR_URL unset the page says no mirror is configured.
6. A failing core check is named first in the summary.
7. /trust never states a certification the repository lacks.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Status should keep working when a dependency such as the database is down; the page falls back to 'Checks unavailable' on a read error (status/page.tsx:86-100) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the next scheduled refresh time on /status.
- [proposed] Add a test linking each trust evidence name to an existing file.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | DocsPage | `apps/web/app/docs/page.tsx` | Documentation portal. |
| service | documentationIndex | `apps/web/app/docs/doc-index.ts` | Groups help documents by category. |
| screen | HelpPage | `apps/web/app/help/page.tsx` | Help centre home with search and collections. |
| screen | HelpArticlePage | `apps/web/app/help/[slug]/page.tsx` | One article per slug. |
| component | HelpSearch | `apps/web/features/support/components/HelpSearch.tsx` | Debounced search UI. |
| endpoint | GET /api/help/search | `apps/web/app/api/help/search/route.ts` | BM25 search over the support corpus. |
| other | Support corpus and articles | `apps/web/content/support` | Markdown help articles (47 entries counted in the folder). |
| screen | StatusPage | `apps/web/app/status/page.tsx` | Health page. |
| service | runHealthChecks and getCachedHealthChecks | `apps/web/lib/server/health-check.ts` | Probes and 60-second cached result (lines 410, 525). |
| service | signal-view | `apps/web/app/status/signal-view.ts` | Maps results to healthy, degraded, unhealthy, stale, unknown. |
| service | statusMirrorUrl | `apps/web/lib/server/incident/out-of-band.ts` | Mirror link setting. |
| screen | TrustPage | `apps/web/app/trust/page.tsx` | Trust and compliance statement. |
| config | Navigation lists | `apps/web/features/marketing/components/system/nav.ts` | Header and footer links to these pages. |
| screen | Mobile AboutScreen | `apps/mobile/app/(app)/about.tsx` | Help Center and Service Status links. |
| test | StatusPage tests | `apps/web/app/status/__tests__/StatusPage.test.tsx` | Status rendering. |
| test | Trust claim tests | `apps/web/app/trust/trust-claims-index.test.ts` | Rows tied to review dates. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser requests a docs or help page; the server builds it from the support corpus. | our servers | apps/web/app/docs/doc-index.ts:30-60 |
| Search box calls /api/help/search; server scores chunks with BM25 and returns snippets. | our servers | apps/web/app/api/help/search/route.ts:49-75 |
| Status page asks for the cached health result with a 4 second limit; a cache miss triggers the probes. | our servers | apps/web/app/status/page.tsx:92; apps/web/lib/server/health-check.ts:525 |
| Probes call the database, payment provider, cache, identity provider, search and the chat dependency check. | outside service | apps/web/lib/server/health-check.ts:364-423 |
| Trust page renders fixed text. | our servers | apps/web/app/trust/page.tsx:91-280 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Cached health result with its run time | Next render cache keyed status-page/health-checks | server side | revalidated every 60 seconds |
| Article feedback | posted by the feedback widget; destination not opened | server | unknown |
| Search query text | not stored in the route code opened | no | not handled in the code opened |

**Models and providers.** No model is called for help search (route comment 'no model call'). The status 'chat' check reports dependency readiness, and the page says it does not test a model response; which provider it probes is not recorded here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None for all four pages. |
| Permissions | Public, read-only. |
| Subscription | None; free for everyone. Help articles carry plan and platform applicability labels (help/[slug]/page.tsx:127-136). |
| Limits and metering | Search: query 2 to 200 characters, result limit 1 to 12, rate limit bucket 'help-search' (route.ts:28-52). Status: 60 s reuse, 120 s stale threshold. |
| Feature flags | AGI_STATUS_MIRROR_URL; phone marker query parameter. |
| Model compatibility | none found in the code |
| Provider restrictions | Status probes depend on configured services; unconfigured optional ones show as configuration, not failure (StatusPage.test.tsx). |
| Local mode | Not applicable: these are web pages on our servers. Trust page notes Local mode is verified by a packet capture of the CLI and says the public Desktop does not offer Local mode (trust/page.tsx:272). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Help search short query | No request under 2 characters; the server rejects it. | HelpSearch.tsx:25; route.ts:28-31 |
| Search in flight | A new query aborts the previous request. | HelpSearch.tsx:42-48 |
| Corpus unavailable | 503 and an 'unavailable' state, not an empty result. | route.ts:60-73 |
| Unknown help slug | Not found. | help/[slug]/page.tsx:40, 71 |
| Article not for phone | A phone-only message instead of the article. | help/[slug]/page.tsx:63-70 |
| Status read slow or throws | State 'unknown' with 'Checks unavailable'. | status/page.tsx:73-100 |
| Status stale | Shows the older result with its age and tells the reader to reload. | status/page.tsx:55-66 |
| Docs index empty | Message that the index is not loading; fixed guides remain. | docs/page.tsx:226 |
| Accessibility | Status first-screen and docs controls have e2e specs; trust has axe checks. | apps/web/e2e/status-first-screen.spec.ts; apps/web/e2e/enterprise-surface.spec.ts |
| Offline | not handled in the code on these pages. | apps/web/app/docs/page.tsx, apps/web/app/status/page.tsx (searched; no offline handling found) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/status/__tests__/StatusPage.test.tsx`: State, last check, per-check rows, failing check named first, health run failure.
- `apps/web/app/status/__tests__/status-claims.test.ts`: Page rows match the checks runHealthChecks sets.
- `apps/web/app/status/__tests__/signal-view.test.ts`: State mapping and stale after two reuse windows.
- `apps/web/app/docs/__tests__/doc-index.test.ts`: Every help document listed once, linked to its article.
- `apps/web/app/docs/page.test.tsx`: Documentation layout and current-page navigation.
- `apps/web/app/trust/trust-claims-index.test.ts`: No row moved after its last review.
- `apps/web/app/trust/posture-claims.test.ts`: Posture claims tied to workflows and builds.
- `apps/web/e2e/public-docs-search.spec.ts`: Finds an article by body text with keyboard navigation.
- `apps/web/app/help/__tests__/HelpIndexFromPhone.test.tsx`: Phone view hides purchase collection.

**Test scenarios**

- **Search finds an article**
  1. Open /help, type 'credits'.
  - Expected: Results include the usage and credits article with a snippet.
- **Corpus missing**
  1. Run with the support corpus unavailable and search.
  - Expected: Unavailable message, HTTP 503, not 'no results'.
- **Stale status**
  1. Block the health run and wait over 120 seconds; open /status.
  - Expected: 'Stale result' with the last run time and a reload hint.
- **Mirror setting**
  1. Open /status with and without AGI_STATUS_MIRROR_URL.
  - Expected: Link 'Open the status mirror' only when set.
- **Trust review date**
  1. Set the clock after 2026-11-30 and run the trust claim tests.
  - Expected: The honesty test fails until the page is reviewed (as the code comment describes).

**Where to look when it fails**

- Log '[help-search] corpus unavailable' (route.ts:61).
- Health-check warning 'core dependency configuration is incomplete' (health-check.ts).
- Render-cache tag statusHealth.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/002-public-website-and-acquisition-screens.md](../../70-qa/test-plans/web/002-public-website-and-acquisition-screens.md)

## 10. Gaps and dependencies

- **Draft says status 'runs live checks' on every request; code reuses a result for 60 seconds.** Affects: Testers and readers (web). Evidence: apps/web/lib/server/render-cache.ts:35-37; apps/web/lib/server/health-check.ts:525. Work needed: Describe it as near-live.
- **Status does not test a model answer or a chat turn.** Affects: Users judging availability. Evidence: apps/web/app/status/page.tsx:56-57. Work needed: Optional synthetic turn probe.
- **Brief code line for trust (page.tsx:277) and status (:65) are close to but not equal to current lines (TrustPage at 280, status dynamic at 45).** Affects: Brief readers. Evidence: apps/web/app/trust/page.tsx:280. Work needed: Refresh references.
- **No help or docs entry in Desktop, VS Code or Chrome apps found.** Affects: Users of those apps. Evidence: none found in the code. Work needed: Decide scope.

**Depends on**

- surface:web
- surface:mobile
- api:GET /api/help/search
- SYS-observability-and-operations
- SYS-security-and-privacy
- SYS-memory-projects-and-context
- SYS-subscriptions-entitlements-and-usage
- file:apps/web/lib/server/health-check.ts
- file:apps/web/content/support
- F002-07
- F002-11

## Unknown

- Where article feedback is stored.
- Whether search queries are logged.
- Whether every evidence document named on /trust exists.
- Which provider the 'chat' health check probes.
- Whether docs and help are linked inside Desktop.

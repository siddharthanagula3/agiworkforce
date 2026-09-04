# Data transfer, caching and system design review (2026-09-04)

Status: Current
Owner: Founder
Last updated: 2026-09-04

Written by the orchestrating model after the production Neon project exhausted its 5 GB monthly network transfer in three days. Every claim below was read from the code on this date; file paths are given so the reader can verify.

## What went wrong, ranked by bytes

1. Local development shared the production endpoint. The project has one branch, and apps/web/.env.local pointed at it, so the automated QA fleet on the founder's laptop (about 68,000 requests in one thirteen hour dev-server log) was metered as production. This alone explains most of the 5.56 GB. Fixed: local Postgres behind scripts/dev-db-ws-proxy.mjs.
2. The chat sync cursor lived in a closure that reset on every conversation switch (apps/web/features/chat/hooks/use-artifact-cloud-sync.ts), so a delta sync replayed the whole account history, up to 1,000 messages and 500 artifacts with full content per page. Fixed: cursor persisted per user (51057adb4).
3. Preferences were fetched by eleven components with no shared cache, 12,829 times in five hours, and the route read the settings blob twice. Fixed: one cached read with write invalidation, 13 requests became 1 (292c5a92a).
4. List queries selected columns nobody read (projects, skill bodies) and seven chat routes resolved the organisation twice. Fixed (fc7201e4a, 4023799da, 928caf0b5).

## Design findings that were not the cause but would be next

### A. Every bound query is its own transaction with four round trips

packages/platform/data-layer/src/adapters/neon.ts: each `query()` on the user-scoped adapter takes a pooled client, runs `BEGIN; SET LOCAL ROLE app_rls`, then one `set_config` statement, then the query, then `COMMIT`, then releases the client. A route that runs five reads pays twenty statements. The preamble bytes are small, but the pattern multiplies latency and compute time and makes a request-scoped transaction impossible to reason about. The right shape is one scoped connection per request (bind once, run the route's statements, commit once), which the adapter's `transaction()` already supports for callers that opt in. This is design debt worth a focused change in the data layer, with the RLS tests kept green.

### B. Two unbound reads before any route runs

apps/web/lib/api-auth.ts reads `profiles.account_status` on every authenticated request, and apps/web/lib/services/active-workspace-service.ts reads `user_settings` to resolve the active organisation. Neither is cached. Both values change rarely and have clear invalidation points (account status changes, workspace switch). A Redis read-through with a short TTL and explicit invalidation removes two Postgres reads from every request across 175 routes. Upstash Redis is already wired (apps/web/lib/rate-limit.ts) but used only for rate limits, video tasks and sandbox sessions.

### C. Crons keep the compute awake with no users

vercel.json runs three jobs every ten minutes: health-probe (apps/web/lib/server/health-check.ts runs `select 1` against Postgres), drain-audit-streams (lists organisations with streaming audit destinations, then drains each), and page-security-anomalies. On a free Neon project that autosuspends after five minutes idle, a ten-minute cadence guarantees a cold start and a wake every cycle: 432 wakeups a day, which is why the dashboard shows 16.69 compute hours for three days with essentially no traffic. Health should not prove liveness by querying the metered database ten minutes apart; the audit drain should consult a cheap Redis flag (set when a destination is registered) before opening Postgres; the anomaly pager should run on the security event stream, not on a timer against the database.

### D. Postgres used as a cache

apps/web/lib/connectors/mcp-runtime-cache.ts stores MCP discovery results in the `mcp_response_cache` table, and the connector directory snapshot lived in the same table as one JSON blob (now behind a version stamp and an in-process cache, 718dfcac1). A cache that lives in the metered database charges egress for every hit. Redis is the right home for discovery results and directory pages; Postgres should hold only durable state.

### E. Client polling

Defaults are sound: the shared query client sets a five minute staleTime, no refetch on focus, no interval. The exceptions are the usage summary (apps/web/lib/hooks/useManagedUsageSummary.ts, every 60 seconds while visible, 3,261 calls in five hours) and the schedules page (every 6 seconds only while a run is due, bounded to that page). The usage poll should move to five minutes plus refetch after a completed turn, which is when the number actually changes.

### F. HTTP caching

52 of 175 GET routes set Cache-Control; the rest are per-user and correctly uncached at the CDN. This layer does not affect Postgres egress and needs no change for this incident.

### G. Sync payload shape

The delta sync pages are large (500 conversations, 1,000 messages, 500 artifacts) and carry full message metadata and artifact content. With the cursor fixed this is proportional to real change. A byte budget per pull (stop the page when the response would exceed a few hundred kilobytes and return the cursor) would bound the worst case for accounts with very large artifacts.

## Order of work

1. Done: local database, cursor, preferences, narrow selects, directory version stamp.
2. Now: cron cadence and gating (C), usage poll interval (E).
3. Next: Redis read-through for account status and active organisation (B), after the tenant isolation guard work lands in the same files.
4. Then: MCP discovery cache to Redis (D), sync byte budget (G).
5. Design debt: request-scoped transaction in the data layer (A).

## Numbers

| Measure                                      | Value                                 |
| -------------------------------------------- | ------------------------------------- |
| Transfer since 1 September                   | 5.56 GB, all on the production branch |
| Average rate                                 | about 75 MB per hour                  |
| Dev server requests in one thirteen hour log | 67,676                                |
| Production requests in 72 hours              | about 4,400                           |
| Compute in three days                        | 16.69 CU-hours                        |
| Reset                                        | 2026-10-01 00:00 UTC                  |

## How chatgpt.com and claude.ai behave (observed 2026-09-04 in the founder's browser)

Measured with the browser's network log on the signed-in accounts, three actions each: open a conversation, switch to a second one, switch back, then thirty seconds idle.

| Action                                    | chatgpt.com                                                                                                           | claude.ai                                                     | AGI web today                                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| App boot                                  | about 50 small calls, each one concern (settings, models, a 28-item conversation page, pins, tasks), 0.3 to 6 KB each | about 20 small calls, 0.3 to 3.3 KB each                      | fewer calls but several fat ones, plus a sync pull of account history                                                                       |
| Open a conversation                       | one GET with the last 10 turns (6 KB), one init call, one canvas docs call, file metadata per attachment              | one GET of the whole message tree, notices, artifact versions | conversation GET with up to 100 messages and full metadata, branches, a sync pull, usage, permissions, media availability, skills, projects |
| Switch back to a conversation seen before | no conversation refetch; one init call and one stream-status check                                                    | no conversation refetch; artifact versions revalidated        | page remount refetches most of the above                                                                                                    |
| Thirty seconds idle                       | zero calls                                                                                                            | zero calls                                                    | usage poll every 60 seconds (moving to 5 minutes)                                                                                           |

Three patterns stand out. The conversation payload is windowed from the newest turn and older turns load on scroll. The client keeps every opened conversation in memory and only asks the server a cheap question on return (is a stream running, did an artifact change). Nothing polls; the turn stream is the only long-lived connection and every other number refreshes on an event.

## Optimisation plan, in order of bytes saved per unit of work

1. Window the conversation read. GET /api/chat/conversations/:id returns the newest N turns (start at 10 like ChatGPT, tune by measurement) with a cursor for older pages, and drops metadata keys the transcript does not render on first paint (raw provider payloads, tool results duplicated in step lines). Measure bytes before and after on a fifty-turn conversation.
2. Stop the page remount on conversation switch. WebChatPage is remounted by router.push on every switch, which is what turns cached reads into fresh reads. Keep the shell mounted, key only the transcript, and hold opened conversations in the chat store; on return send one cheap revalidation (server_version or a stream-status check) instead of the full read. Target: at most three requests per switch, as both rivals do.
3. Route every per-mount fetch through the query client. tool-permissions-store.ts, use-media-model-availability.ts and the fetch-in-effect sites listed in the same review issue raw fetches on mount, which is why the connector permissions and media availability routes were called thousands of times in five hours. One cached query per concern with the five minute default and event-driven invalidation.
4. Keep the web client from mirroring the account. The artifact cloud sync pull exists for desktop and mobile local-first stores; on the web it copies messages and artifacts the transcript already fetched. Limit the web pull to artifacts changed since the cursor with a byte budget per pull, and consider dropping the message half on web entirely (a product decision for the founder).
5. Server side, as already listed: Redis read-through for account status and active organisation, one transaction per request in the data layer, Redis for discovery and directory caches, event-gated crons.
6. Measure egress where it happens. Log response bytes per route on the server (the Neon consumption API is not available on the free plan) and alert when a day exceeds a budget; this is the instrument the rivals have and this project did not.

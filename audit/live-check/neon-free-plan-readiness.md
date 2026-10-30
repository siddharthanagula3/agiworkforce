# Neon Free plan readiness

Status: Source changes implemented; production quota validation pending
Owner: Web + mobile + signaling maintainers
Last verified: 2026-10-30
Purpose: Track measured transfer/compute causes and the remaining live checks for Free allowances.
Retention: Delete this tracker when the production acceptance checks pass; the original chat retains the dated diagnostic bundle.

## Preserved baseline

The pre-downgrade collection contains 42 files and 2,975 consumption metric rows.
It includes nearly seven days of hourly history, 59 days of daily history, all
returned eligible monthly periods requested since May, current projects,
branches, endpoints, snapshots and operation history. PostgreSQL diagnostics
include 496 normalized statement-statistics entries, statistics for 267 tables
and 931 indexes, schema metadata, table I/O, connection counts and cache-width
samples. API/database manifests and SHA-256 checksums were verified. This is a
diagnostic export, not a customer-content backup. Credentials and customer
messages were not exported. The raw bundle is local to the original chat and is
not committed to Git.

The 18 complete UTC days October 12–29 consumed 172.726 CU-hours and 6.689 GB
public transfer. The unchanged-workload projection is 297.473 CU-hours and
11.519 GB per 31 days. These are baseline projections, not post-change results.

| Resource            | Baseline                           | Free allowance per project | Engineering target                          |
| ------------------- | ---------------------------------- | -------------------------- | ------------------------------------------- |
| Compute             | 297.473 CU-hours/month projected   | 100 CU-hours/month         | At most 80 CU-hours/month, 2.58/day         |
| Public transfer     | 11.519 GB/month projected          | 5 GB/month                 | At most 4 GB/month, 129 MB/day              |
| Production database | 361,299,968 PostgreSQL bytes       | 1 GB                       | At most 0.8 GB                              |
| Current branches    | One per project                    | 10/project                 | Stay within allowance                       |
| Compute range       | 0.25–8 CU configured at collection | At most 2 CU               | Verify the supported range during downgrade |

Free suspends compute when compute hours or public transfer are exhausted until
the next period or an upgrade. How already consumed usage is treated during a
downgrade was not verified. Do not assume a new allowance on downgrade.
Official sources read October 30, 2026: [plans](https://neon.com/docs/introduction/plans),
[usage calculations](https://neon.com/docs/introduction/usage-calculations),
[scale to zero](https://neon.com/docs/introduction/scale-to-zero), and
[changing plans](https://neon.com/docs/introduction/manage-billing).

## Transfer cause and changes

A metadata-only production query measured public directory cache records:

| Record                            | Serialized stored bytes |
| --------------------------------- | ----------------------- |
| Legacy directory snapshot, v1     | 41,435,426              |
| Compressed directory snapshot, v2 | 5,714,429               |
| Icon index                        | 531,693                 |

The generic cache lookup ran 25,981 times and returned 5,603 rows in the captured
statement window. That query aggregates multiple cache methods, so it does not
establish how often each of the records above was returned. PostgreSQL statement
statistics do not contain exact wire-byte attribution. Repeated multi-megabyte
snapshot loads are nevertheless a concrete transfer exposure. The 500-row
physical-page sample also found icon JSON values as large as 261,186 bytes; the
sample cannot rank total egress.

Implemented:

- Version-stamped public directory snapshots and icon indexes use the existing
  Next Data Cache across server instances. Compressed values are split into
  bounded chunks because both the raw and compressed snapshots exceed the
  installed Next cache's 2 MB per-entry limit. Chunks carry a content digest;
  missing chunks from an advanced snapshot cannot be mixed with an old manifest.
- Public icon bytes use the existing persistent cache layer, keyed by source
  URL, with the stored expiration honored. Failures are not cached as successful
  icons. Private account caches are not shared by these public readers.
- `agi.cache.postgres.reads` and `agi.cache.postgres.value.bytes` record database
  cache reads, hits/misses and UTF-8 value bytes under five bounded categories.
  No cache keys, account IDs, URLs or content become metric labels. These count
  stored value bytes and omit transport overhead; they are not invoice meters.

Controlled request-count comparisons: a repeated large icon previously caused
50 PostgreSQL value reads for 50 requests; the changed reader causes one. An
idle visible usage hook previously made 13 requests over an hour including its
initial load; it now makes one, then refreshes once on interaction. Regression
checks were run with the cache/activity change removed, observed failing with
50 and 13 calls, then restored. The cache test uses the installed Next cache
implementation with an in-memory backend enforcing the entry-size ceiling.

## Idle work and checks across consumers

| Consumer                 | Finding and resulting behavior                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared web/Electron chat | Usage reads remain shared across components; a single activity tracker pauses optional reads after an untouched minute, on blur and while hidden. Interaction refreshes stale readings, explicit usage refresh still works and completed turns still refresh usage. Proactive usage/session timeout prompts stay quiet while inactive; session expiry itself remains enforced. |
| Notifications            | Optional feed refresh stops while idle/hidden and resumes when stale on interaction. Explicit read/mark actions are unchanged.                                                                                                                                                                                                                                                 |
| Chrome side panel        | Optional three-minute account refresh uses the same activity gate; existing streaming/request behavior remains intact.                                                                                                                                                                                                                                                         |
| Web media and schedules  | Presentation polls pause when hidden and resume when viewed. Accepted server jobs and schedules continue independently.                                                                                                                                                                                                                                                        |
| Mobile                   | Periodic Cloud sync, media and service-notice refresh skip inactive/background app state and refresh on foreground. Cloud Code presentation polls require the active app state. Usage reset refresh waits for foreground. Explicit sync and accepted server work remain available.                                                                                             |
| VS Code                  | The inspected tree picker enables refresh while open and disables it on hide. It already has the needed visibility gating.                                                                                                                                                                                                                                                     |
| Shared database adapters | The Neon adapter already uses HTTP for eligible unbound pool queries, bounded idle connections and explicit RLS transaction scope. Transactions, tenant isolation, balance reads and authorization were preserved.                                                                                                                                                             |
| Run/event queries        | Lists are bounded and event journaling already batches stream deltas. SQL stars returning required complete contracts were not treated as evidence of unused data without checking their consumers.                                                                                                                                                                            |
| Public status            | Health checks already use a shared render cache. Their freshness and dependency validation remain intact.                                                                                                                                                                                                                                                                      |

The captured query statistics include collector traffic. Known catalog queries
are excluded from the exported application rankings; that filter is not an
endpoint-attribution instrument. Local UI countdowns and device-only host reads
do not automatically consume Neon transfer.

## Signaling and cron compute

The snapshot recorded 29,742 signaling table probes since the October 25
restart, approximately every 15 seconds. Hosting `/ready` checks and the
15-second database-check TTL match that query shape. Each pool cleanup
statement appeared 92,851 times, which must not be counted as separate users.

The changed relay preserves startup checks and the 15-second active/failure
check window. While no socket or pairing is active, a successful check may be
reused for the configurable `SIGNALING_DB_IDLE_CHECK_MS` window, defaulting to
30 minutes. A real database operation or transport failure invalidates the
reading immediately. A completely idle external outage can therefore take up
to that window to appear in readiness; active requests still validate against
the store and fail closed. The age remains visible in the existing checkedAt
field. Existing socket, revocation and authorization paths remain enforced.

The repository configures 45 crons. Frequent jobs already call
`lowPowerCronSkip()` except the security-anomaly route, whose Redis marker
avoids an idle database read. Hourly/daily jobs align with the first 15 minutes
of the hour. The production Vercel configuration contains an encrypted
`AGI_DB_LOW_POWER` variable; its value and presence in the serving deployment
were not retrieved. No production variable was changed by this work.

An hourly 15-minute maintenance window plus the five-minute suspension tail
means about eight awake hours/day before real traffic: 62 CU-hours/month at
0.25 CU, but 124 at 0.5 CU. Reduced polling alone does not prove the compute
allowance. Do not reduce mandatory billing, security or deletion work to meet
a synthetic idle measurement.

## Verification and remaining live acceptance

Local verification covers the shared activity tracker, real-browser idle usage
requests and warning visibility, notifications, actual Next caching behavior,
large/chunked payloads, changing versions, bounded metric labels, and signaling
startup/outage/authorization behavior. The full signaling suite passed 271 tests.
Mobile sync tests verify no timer-driven API calls in background and immediate
foreground resumption. Commit checks are run on an isolated tree so unrelated
untracked work is not included or used as verification evidence.

Remaining production checks:

1. Deploy the committed code and verify the serving release and actual
   low-power setting. A source commit alone does not change production.
2. Observe a quiet interval longer than five minutes using the management
   endpoint, without a SQL probe waking the compute being measured.
3. Check cache-byte metrics and actual quota readings over a representative
   day/week. Targets are 2.58 CU-hours/day and 129 MB/day, then 80 CU-hours and
   4 GB/month. Do not claim those savings without a live measurement.
4. Verify downgrade-time quotas, the 2-CU limit, storage, branches and snapshots
   in the console. Paid consumption history is unavailable after downgrade;
   do not replace it with SQL keepalives.

The screenshot's CSP-blocked external font and unused stylesheet preloads are
browser asset warnings. They do not prove Neon request volume, and weakening
CSP is not a database optimization.

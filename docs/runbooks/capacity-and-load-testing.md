# Capacity and load testing

Status: Current
Owner: Platform lead
Last updated: 2026-10-02

What the system's limits are, which of them are measured, and how to measure the
rest. `tools/load-test` holds the scenarios; this file holds the targets and the
rules for believing a result.

**Nothing here claims a proven capacity.** `AGENTS.md` section 8 is the rule: a
concurrency figure is a target that must be proven by measurement and never
claimed without a live run behind it. Every row below is marked either measured,
with the run that measured it, or unmeasured, with the scenario that would.

## Where the numbers live

| Kind of number                | Owner                                  |
| ----------------------------- | -------------------------------------- |
| Service level objectives      | `apps/web/lib/server/slo/catalogue.ts` |
| Rate limits per namespace     | `apps/web/lib/rate-limit.ts`           |
| Published rate limit contract | `docs/standards/api-rate-limits.md`    |
| Database pool sizing          | `DatabaseConnectionConfig.poolSize`    |
| Load scenarios and thresholds | `tools/load-test`                      |

A threshold in a load scenario must come from one of these. A scenario that
invents its own target is measuring against an opinion, and its own comment says
so where that is currently the case.

## Capacity targets and their current state

| Dimension                       | Target                                            | State                                                       | Instrument                          |
| ------------------------------- | ------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------- |
| Concurrent streaming turns      | to be established by a run                        | unmeasured                                                  | `tools/load-test/chat-streaming.js` |
| Search over user history        | availability objective in the catalogue           | unmeasured latency                                          | `tools/load-test/search.js`         |
| Durable run throughput          | to be established by a run                        | unmeasured                                                  | `tools/load-test/durable-runs.js`   |
| Large request bodies            | 12 MiB per chat attachment, enforced in the route | enforced, unmeasured under load                             | `tools/load-test/large-uploads.js`  |
| Conversation and message volume | horizontal, on Postgres indexes                   | unmeasured                                                  | no scenario yet                     |
| Connector directory size        | data-driven, no per-connector cost at read        | unmeasured                                                  | no scenario yet                     |
| Remote-control fleet size       | one host per paired companion                     | unmeasured                                                  | no scenario yet                     |
| Provider rate limits            | per credential, with breakers                     | reacts correctly per credential; fleet behaviour unmeasured | no scenario yet                     |

The four dimensions with no scenario are the honest gaps. Two of them
(conversation volume, connector directory) need a seeded dataset far larger than
any test account holds, which is the work, not the script.

## Resource dimensions and who owns them

| Resource              | Bounded by                                                                     | Watched where                       |
| --------------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| Database connections  | `poolSize` in the data-layer config                                            | not alerted; see the gap below      |
| Key-value throughput  | the provider's quota                                                           | a dead store closes the chat path   |
| Queue workers         | the durable runtime's own concurrency                                          | not configurable in this repository |
| CPU and memory        | the hosting platform's function limits                                         | platform dashboards, not in repo    |
| Object storage        | the store's own quota                                                          | platform dashboards, not in repo    |
| CDN                   | platform-managed                                                               | platform dashboards, not in repo    |
| Streaming connections | one active turn per conversation, admitted in `conversation-turn-admission.ts` | per-request                         |
| Notification sends    | the generic rate limiter                                                       | per namespace                       |

Two of these are worth stating plainly rather than leaving implied:

- **There is no global backpressure.** Admission is per conversation, and video
  generation has its own slot. Nothing sheds load across the whole process, so
  the first symptom of saturation is latency rather than refusal. A run that
  finds the ceiling should say which of the two it hit.
- **The key-value store is a hard dependency of the completion path.** When it
  is unreachable or over quota, every completion fails the same way. That is a
  capacity dimension even though it looks like an availability one.

## Running on the Neon Free plan

The Free plan caps two things a quiet deployment can still exhaust: public network
transfer (5 GB a month, every byte Postgres sends to Vercel, CI or a script) and
compute hours (a compute that never idles for five minutes never suspends).

- **Transfer.** The connector directory snapshot lives in `mcp_response_cache`
  under two keys. `v2` holds it brotli-compressed (`br64:` prefix); `v1` keeps
  the plain JSON an older build reads. A snapshot write refreshes both rows, so
  a rollback still serves the full directory. This build reads `v2` when no
  legacy row exists or its stamp is newer than `v1`, otherwise it reads the
  legacy row, including changes an older build made during a rollback. It then
  refreshes `v2` with an insert if absent or a replacement conditional on the
  stamp it read, avoiding replacement of a concurrently refreshed `v2` row.
  An ingest refuses to merge onto a row it cannot decode. The icon route reads the small
  `connectors.directory.icon-index` row instead of the snapshot. Icons and the
  public directory listing carry `Vercel-CDN-Cache-Control` with `Vary: Origin`,
  so repeat visits are served by the CDN, not the database.
- **Compute.** Set `AGI_DB_LOW_POWER=1` in Production. Crons that run more than
  once an hour then do their work only in the first
  `LOW_POWER_CRON_WINDOW_MINUTES` (15) minutes of each UTC hour and answer
  `{"skipped":"db_low_power"}` otherwise, and every hourly or daily cron is
  scheduled inside that window, so the database wakes once an hour.
  `apps/web/__tests__/cron-low-power-window.test.ts` keeps new crons inside it.
- **What users notice in low-power mode.** Scheduled tasks can start up to an
  hour late; the missed-run grace widens to two hours, so a late run still
  runs, though the schedule screen still describes the 15-minute cadence.
  Background jobs, reapers and health probes run hourly. Reservation recovery
  runs hourly too, so a reservation stranded by a dead turn can hold a user's
  quota and show "limit reached" for up to an hour; turn the mode off for
  heavy testing. Retrieval indexing on upload is unaffected (it runs as a
  workflow).
- **Leaving low-power mode.** Remove the variable and redeploy once real traffic
  arrives or the plan changes; the cron schedules need no edit.

## Running a load test

`tools/load-test/README.md` has the commands and the environment variables. Five
rules decide whether a run means anything:

1. **Never against production.** A load run against the live service is an outage
   you scheduled. Use a preview deployment sized like production and record which
   one.
2. **Verify the instrument.** The generator is a source like any other. Record
   where it ran and its own saturation; discard a run where the generator gave
   out before the target did.
3. **A failing threshold is the result.** Relaxing it to get a green run deletes
   the measurement. Change the target here, with the reason, or fix the system.
4. **One variable per run.** Changing the concurrency and the instance size in
   the same run answers neither question.
5. **Report the shape.** A p95 that holds while the error rate climbs is a system
   shedding load, which is a different finding from one that is coping.

## Recording a result

A completed run belongs in `docs/research/` with its date, the target
deployment, the scenario, the environment variables it ran with, and the raw k6
summary. Then, and only then, update the state column in the table above and,
where the run establishes a durable objective, promote it into
`apps/web/lib/server/slo/catalogue.ts` so the public pages and the alerting read
the same number.

Do not write a capacity figure onto a public page from a run that is not
recorded that way. The claim-honesty tests exist to catch exactly that.

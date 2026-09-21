# Incident Response Runbook

Status: Current
Owner: Platform lead
Last updated: 2026-09-18

Until 2026-08-09 nothing in this repository could reach a human when production
broke. `/api/health` was correct and public, and no scheduled job, uptime
monitor, or alert integration ever called it. This runbook describes what now
detects an outage, where the alert lands, what to do when it arrives, and the
detection gaps that are still open.

## What detects an outage

| Detector                            | Where                                                    | Cadence                | Reaches a human?                            |
| ----------------------------------- | -------------------------------------------------------- | ---------------------- | ------------------------------------------- |
| `/api/cron/health-probe`            | `apps/web/app/api/cron/health-probe/route.ts`            | every 10 minutes       | yes, through the dispatcher below           |
| `/api/cron/evaluate-slo-burn`       | `apps/web/app/api/cron/evaluate-slo-burn/route.ts`       | :05 and :35 every hour | yes, when an error budget is burning        |
| `/api/cron/page-security-anomalies` | `apps/web/app/api/cron/page-security-anomalies/route.ts` | every 15 minutes       | yes, on a triggered security alert          |
| `/api/cron/reconcile-credits`       | `apps/web/app/api/cron/reconcile-credits/route.ts`       | daily, 00:30 UTC       | yes, by email, only on terminal settlements |
| `/api/health`                       | `apps/web/app/api/health/route.ts`                       | on request             | only if something polls it                  |
| `/status` page                      | `apps/web/app/status/page.tsx`                           | on request             | only if a human opens it                    |

The probe runs the same `runHealthChecks()` the public endpoint and the status
page run. It calls it directly rather than fetching `/api/health` over HTTP:
building a self-request URL from request headers is a Host-header SSRF vector,
and a self-HTTP hop reports the platform unhealthy for reasons of its own.

**Detection latency is up to 20 minutes for an outage**: the probe runs every
ten minutes and holds the page until a second consecutive run misses, so a
single blip does not wake anyone. Error budget burn is evaluated twice an hour
against the objectives in `apps/web/lib/server/slo/catalogue.ts`; a fast burn
pages, a slow burn warns. Both windows and the sample floor under which the
evaluator stays silent are in `apps/web/lib/server/slo/attainment.ts`.

## Where the alert lands

`apps/web/lib/server/incident/dispatch.ts` is the one place an incident reaches
people. Every detector above hands it a key, a severity, a subject and a body,
and it does three things with them.

1. **Email** to whoever the rotation says holds the pager, through the Resend
   transport (`apps/web/lib/support/handoff/resend-client.ts`). With no rotation
   configured it addresses `AGI_SUPPORT_FALLBACK_EMAIL`, the mailbox
   `apps/web/lib/support/handoff/config.ts` already requires to be monitored.
2. **Pager** webhook, when `PAGER_WEBHOOK_URL` is set. Best-effort: a pager that
   is down never stops the email.
3. **Incident channel** webhook, when `INCIDENT_CHANNEL_WEBHOOK_URL` is set, so
   the second responder sees the first one's context rather than a second copy
   of the alert.

Delivery of the email requires **both** `RESEND_API_KEY` and a valid
`AGI_SUPPORT_FROM_EMAIL`. When none of the three channels reached anyone the
dispatcher logs `no human has been told` and the probe returns **HTTP 500**, so
the failed invocation is visible in the Vercel cron log, the last signal left
once email is gone. Check that log after any deployment that changes
environment variables.

## On-call rotation

The rotation is configuration, never a name in the source tree
(`apps/web/lib/server/incident/on-call.ts`):

| Variable                            | Meaning                                                   | Default |
| ----------------------------------- | --------------------------------------------------------- | ------- |
| `AGI_ONCALL_ROTATION`               | Ordered `handle:email` pairs, comma separated             | empty   |
| `AGI_ONCALL_ROTATION_START`         | ISO timestamp the first shift began                       | epoch   |
| `AGI_ONCALL_SHIFT_HOURS`            | Length of one shift                                       | 168     |
| `AGI_ONCALL_ESCALATE_AFTER_MINUTES` | How long one level holds before the next one is pulled in | 15      |

Who holds the pager at an instant is `floor((now - start) / shift)` modulo the
number of responders, so a handover is a date, not a calendar invitation
somebody has to remember. An entry that is not an address is dropped rather
than paged: an alert addressed to a person who does not exist reaches nobody.

**An empty rotation is honest, not broken.** With nothing configured every
alert goes to the monitored mailbox, exactly as it did before, and the
`Escalation level` line in the body says `support mailbox` rather than a name.

## Escalation

Without a pager vendor there is no acknowledgement signal, so the dispatcher
uses the only one it has: whether the condition is still true on the next
evaluation.

| Level | Reached when                                           | Who is notified                     |
| ----- | ------------------------------------------------------ | ----------------------------------- |
| 1     | first dispatch for this incident key                   | the responder on call               |
| 2     | still firing after `AGI_ONCALL_ESCALATE_AFTER_MINUTES` | that responder and the next in turn |
| 3     | still firing after twice that                          | everyone in the rotation            |

The level is held in the key-value store under `agi-incident:<key>` for six
hours and is cleared the moment the condition clears, so the next incident of
the same kind starts at level 1 again. With no key-value store configured every
dispatch is level 1: escalation degrades to the old behaviour rather than
failing the alert.

## Customer notice

Publish nothing until the impact can be described accurately, then:

1. Update `/status`. It is the only customer-facing surface that is not behind
   sign-in and it already states the severity ladder and the notification
   commitment.
2. For a confirmed security incident involving personal data, follow
   `docs/runbooks/personal-data-breach.md`, which owns the regulator and data
   subject clocks. Do not improvise a parallel notice.
3. For an availability incident, email affected account holders at the address
   on the account once the impact window is known. Use the template below and
   keep it to what is known:

   > **Subject:** AGI service disruption on \<date\>, \<impact in five words\>
   >
   > Between \<start\> and \<end\> UTC, \<what did not work\> for \<who was
   > affected\>. \<What we did\>. The service has been \<restored / degraded
   > with a workaround\> since \<time\>.
   >
   > What we know about the cause: \<one paragraph, no speculation\>.
   > What we are changing: \<the follow-ups and their dates\>.
   > If you are still affected, reply to this mail.

   Never claim a cause that has not been confirmed, never quote an availability
   number that is not measured, and never promise a date the follow-up list
   does not already carry.

## Severity

| Probe severity | Overall status | What is broken                                                | Response                                                                        |
| -------------- | -------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `CRITICAL`     | `unhealthy`    | database unreachable, or no Neon connection string configured | Page now. The platform cannot serve requests.                                   |
| `CRITICAL`     | `unhealthy`    | the key-value store did not answer one read                   | Page now. Rate limiting and cached reads fail closed, so turns refuse.          |
| `CRITICAL`     | `probe_failed` | the harness threw, or a dependency hung past the 8s budget    | Page now. Health is unknown, which is not the same as healthy.                  |
| `WARNING`      | `degraded`     | Stripe unreachable; chat keeps working                        | Billing only. Handle in business hours unless a launch or renewal is in flight. |
| `WARNING`      | `degraded`     | retrieval index or embedding index absent                     | Search over your own content is blind. Conversations are unaffected.            |

The `degraded` split is deliberate and is asserted by a test: a Stripe outage
must not page as a whole-platform outage, and a retrieval outage must not
either. The cache sits on the other side of that line for the opposite reason:
the product's answer to losing it is to fail closed, so a turn cannot be served
without it.

## When the bad thing is the release itself

If production broke because of what was deployed rather than a dependency,
revert first and diagnose after. The path does not live inside the run that
deployed: dispatch **Deploy Production Surfaces** with `rollback` set, or run
`node scripts/release/rollback.mjs --reason "..."` from a laptop when Actions is
itself unavailable. `/admin/releases` shows what production is serving, what it
last rolled back to, and when the rollback path was last drilled. Full procedure
and limits: `docs/runbooks/release-rollback.md`.

A rollback does not revert the database. If a destructive migration shipped with
the build, go to `docs/runbooks/database-backup-restore.md` instead.

## Triage

### `database: unhealthy`

`select 1` against Neon failed. In order:

1. Open the Neon dashboard for the project, check for a suspended compute,
   an exhausted connection pool, or a region incident.
2. Confirm `DATABASE_URL` / `AGI_DATABASE_URL` are still set on the Vercel
   project. A rotated or dropped variable presents identically to a dead
   database.
3. `/status` renders the same checks with a timeout, and is the fastest
   confirmation that the failure is real and not the probe's own network.

### `cache: unhealthy`

The probe read one constant key and the store did not answer within a second.
The message is always `unavailable`, deliberately: this is a public payload, so
no host, key name or vendor error text appears in it. The reason is on the log
line, under `Cache health check failed`.

Read that line first, because the two causes need opposite responses:

- A quota or rate-limit refusal. The store accepted the connection and rejected
  the command. Check the Upstash dashboard for the request limit before assuming
  the network; this account has exhausted that quota before, and when it does,
  chat fails closed with it.
- A connection or timeout failure. Confirm `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN` (or the `KV_REST_API_*` pair) are still set on the
  Vercel project, then check the vendor's status.

An absent key is not a fault. The probe asks whether the store answers, so an
empty read is a pass and nothing writes the key.

This pages as `unhealthy` on purpose. Rate limiting and cached reads fail closed,
so while it is down a turn refuses rather than serving unmetered. Chat is
affected even though the `chat` check can still read healthy: that check resolves
a route, it does not serve a turn.

If the store is not configured at all, `environment` reports the missing core
dependency and the probe issues no command; `key_value` then reads `unconfigured`
rather than `failing`, which is a deploy configuration failure, not an outage.

### `search: unhealthy` and `vector: unhealthy`

One catalogue query answers for both and they fail apart.

- `index schema missing`: `retrieval_documents` or `retrieval_chunks` is absent.
  The retrieval migration has not run against this database. Both checks report
  it, because neither half exists.
- `full text index missing`: the tables are there and the weighted `tsvector`
  index is not, so keyword retrieval falls back to a sequential scan.
- `extension missing`: the `vector` extension is not installed, so every semantic
  query returns nothing. Full text keeps working, which is why this degrades
  rather than pages.
- `embedding index missing`: the extension is present and the cosine index is
  not. Semantic queries still answer and get slower as the table grows.

None of these blocks a conversation. Confirm against the database, then run the
retrieval index migration through the normal migration path rather than creating
an index by hand, so the next environment is not missing it too.

### `environment: unhealthy`

Neither `DATABASE_URL` nor `AGI_DATABASE_URL` is set. This is a deploy
configuration failure, not an outage: the last deployment shipped without a
database URL. Restore the variable and redeploy. The check reports only a count,
never names, do not expect the alert to tell you which variable is missing.

### `stripe: unhealthy`

`STRIPE_SECRET_KEY` is unset, `stripe.products.list` failed, or one of the
canonical `STRIPE_PRICE_*` objects is unreachable/inactive/non-recurring under
that key. Chat, sign-in and every non-billing surface keep working. Check
status.stripe.com first; if Stripe is up, confirm the secret, webhook endpoint,
publishable key, and every configured Price belong to the same Stripe account
and test/live mode. Price IDs do not encode their mode, so verify them in the
Stripe Dashboard rather than inferring it from the ID text.

### `probe_failed`

The probe could not measure the platform, so the `database` / `stripe` /
`environment` lines in that alert read `not measured` and mean nothing. The
`Failing checks:` line says which one it was: `checks threw` (the harness itself
is broken) or `timed out after 8000ms` (a dependency accepted the connection and
never answered, the usual Neon or Stripe stall). Treat a timeout as an outage
until `/status`, which races the same checks, says otherwise. The probe pages on
this path whether or not the mail is delivered, and always returns HTTP 500.

### `credit settlement drift`

Subject `[AGI WARNING] <env> credit settlement drift · N terminal`. This is not
an outage: it comes from `/api/cron/reconcile-credits`, and it means `N` durable
credit settlements were abandoned permanently in that run, the provider call
was served, and the reservation delta will never be debited. Balances for those
accounts are now higher than the usage behind them.

It is edge-triggered: `process_credit_settlement_queue()` scans `pending` rows
only, so each job is reported in the single run that flips it to `terminal` and
never again. One mail per invocation at most, so a repeat next day means new
drift, not the same jobs.

```sql
select id, user_id, amount_cents, last_error_code, last_error, completed_at
  from credit_settlement_jobs
 where status = 'terminal'
 order by completed_at desc limit 50;
```

`last_error_code` says which failure it was: `RETRY_EXHAUSTED` (12 attempts of a
retryable fault, look for a Neon incident in that window), `SQLSTATE_*` (a
non-retryable database error, usually a schema or constraint change), or a
`deduct_credits()` rejection code (the ledger refused the debit; the account
state is the thing to inspect, not the queue). The mail carries counts only.
user ids and amounts stay in the database.

Like the health probe, an undelivered alert returns **HTTP 500** so the failed
invocation is visible in the Vercel cron log. The settlement work itself has
already committed and is idempotent, so that 500 never double-charges anyone.

## Postmortem

Every severity 1 and severity 2 incident gets a written postmortem within five
working days, from `docs/runbooks/incident-postmortem-template.md`. It is
blameless: the subject is the system that let the failure through, never the
person who typed the command.

A postmortem is finished when each follow-up in it exists as a row in
`ACTIVE_ISSUES.md` with a named owner and a date, or as a defect row in
`docs/agent-context/known-flaws.md` when it is a known behaviour rather than
work in flight. A follow-up that lives only in the postmortem is a follow-up
nobody owns, which is the failure mode this rule exists for.

## Verifying the alert path (drill)

Run this after any change to the probe, the health checks, the dispatcher, or
the email configuration. It is the only way to know the path still works,
because a path that is never exercised is indistinguishable from one that is
broken.

1. Deploy a preview build.
2. Remove `DATABASE_URL` and `AGI_DATABASE_URL` from the preview environment.
   Both `environment` and `database` then report unhealthy, so overall status is
   `unhealthy`: the same state a real outage produces.
3. Invoke the probe twice with the deployment's cron secret. The first miss is
   held deliberately; the second one dispatches:

   ```sh
   curl -i -H "Authorization: Bearer $CRON_SECRET" \
     https://<preview-deployment>/api/cron/health-probe
   ```

4. Expect `HTTP 200` and a body carrying
   `"alerted":true,"delivery":"delivered","severity":"critical"` with an
   `escalationLevel`, and expect the mail within a minute at whichever address
   the rotation resolves to.
   - `delivery: "undeliverable"` with `HTTP 500` means the probe worked and no
     channel reached anyone. Fix `RESEND_API_KEY` / `AGI_SUPPORT_FROM_EMAIL`.
   - `HTTP 401` means `CRON_SECRET` does not match. The route is fail-closed and
     will also 401 when no secret is configured at all.
5. Restore the environment variables and redeploy the preview.

Local equivalent:
`pnpm --filter @agiworkforce/web exec vitest run app/api/cron/health-probe lib/server/incident`
covers the decision logic (severity split, undeliverable-is-a-failure,
harness-threw, hung-dependency, rotation and escalation) but not real delivery.
It is not a substitute for the drill.

## Open gaps

These cannot be closed by a commit.

- **No pager vendor.** `PAGER_WEBHOOK_URL` is the seam and the dispatcher posts
  to it, but no PagerDuty/Opsgenie/BetterStack account exists, so unless that
  variable is set the alert is an email and a channel post. Choosing and paying
  for the vendor is a founder action; no further code is needed to adopt one.
- **No external uptime monitor.** Every detector above runs _inside_ the
  deployment being measured, so a deployment that fails to boot, a DNS failure,
  or a Vercel region outage is invisible to all of them. An external monitor
  polling `/api/health` from outside is the only detector that survives the
  platform being down, and it needs no code, `/api/health` is public and
  already returns 503 when core checks fail.
- **Nobody may be in the rotation.** The rotation is a deployment variable. If
  `AGI_ONCALL_ROTATION` is unset in production then coverage is one mailbox and
  whoever reads it, which is not 24/7 and is not claimed to be.

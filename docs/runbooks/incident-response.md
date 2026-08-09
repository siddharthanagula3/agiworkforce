# Incident Response Runbook

Status: Current
Owner: Platform lead
Last updated: 2026-08-09

Until 2026-08-09 nothing in this repository could reach a human when production
broke. `/api/health` was correct and public, and no scheduled job, uptime
monitor, or alert integration ever called it. This runbook describes what now
detects an outage, where the alert lands, what to do when it arrives, and the
detection gaps that are still open.

## What detects an outage

| Detector                 | Where                                         | Cadence          | Reaches a human?           |
| ------------------------ | --------------------------------------------- | ---------------- | -------------------------- |
| `/api/cron/health-probe` | `apps/web/app/api/cron/health-probe/route.ts` | daily, 06:15 UTC | yes, by email (below)      |
| `/api/health`            | `apps/web/app/api/health/route.ts`            | on request       | only if something polls it |
| `/status` page           | `apps/web/app/status/page.tsx`                | on request       | only if a human opens it   |

The probe runs the same `runHealthChecks()` the public endpoint and the status
page run. It calls it directly rather than fetching `/api/health` over HTTP:
building a self-request URL from request headers is a Host-header SSRF vector,
and a self-HTTP hop reports the platform unhealthy for reasons of its own.

**Detection latency is up to 24 hours.** The Vercel project is on the Hobby
plan, which rejects the deploy outright for any cron more frequent than daily
(`PROD-VERCEL-DEPLOY-TOPOLOGY-01`), so a tighter cadence would take the site
down in order to improve its monitoring. Closing this gap is a founder action —
see [Open gaps](#open-gaps).

## Where the alert lands

The probe sends through the Resend transport
(`apps/web/lib/support/handoff/resend-client.ts`), addressed to
`AGI_SUPPORT_FALLBACK_EMAIL` — the mailbox
`apps/web/lib/support/handoff/config.ts` already requires to be monitored. It
defaults to `support@agiworkforce.com`.

Delivery requires **both** `RESEND_API_KEY` and a valid
`AGI_SUPPORT_FROM_EMAIL`. With either missing, nothing is delivered and the
probe returns **HTTP 500**, so the failed invocation is visible in the Vercel
cron log — the last signal left once email is gone. Check that log after any
deployment that changes environment variables.

## Severity

| Probe severity | Overall status | What is broken                                                | Response                                                                        |
| -------------- | -------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `CRITICAL`     | `unhealthy`    | database unreachable, or no Neon connection string configured | Page now. The platform cannot serve requests.                                   |
| `CRITICAL`     | `probe_failed` | the harness threw, or a dependency hung past the 8s budget    | Page now. Health is unknown, which is not the same as healthy.                  |
| `WARNING`      | `degraded`     | Stripe unreachable; chat keeps working                        | Billing only. Handle in business hours unless a launch or renewal is in flight. |

The `degraded` split is deliberate and is asserted by a test: a Stripe outage
must not page as a whole-platform outage.

## Triage

### `database: unhealthy`

`select 1` against Neon failed. In order:

1. Open the Neon dashboard for the project — check for a suspended compute,
   an exhausted connection pool, or a region incident.
2. Confirm `DATABASE_URL` / `AGI_DATABASE_URL` are still set on the Vercel
   project. A rotated or dropped variable presents identically to a dead
   database.
3. `/status` renders the same checks with a timeout, and is the fastest
   confirmation that the failure is real and not the probe's own network.

### `environment: unhealthy`

Neither `DATABASE_URL` nor `AGI_DATABASE_URL` is set. This is a deploy
configuration failure, not an outage: the last deployment shipped without a
database URL. Restore the variable and redeploy. The check reports only a count,
never names — do not expect the alert to tell you which variable is missing.

### `stripe: unhealthy`

`stripe.products.list` failed or `STRIPE_SECRET_KEY` is unset. Chat, sign-in
and every non-billing surface keep working. Check status.stripe.com first; if
Stripe is up, the key was rotated or revoked.

### `probe_failed`

The probe could not measure the platform, so the `database` / `stripe` /
`environment` lines in that alert read `not measured` and mean nothing. The
`Failing checks:` line says which one it was: `checks threw` (the harness itself
is broken) or `timed out after 8000ms` (a dependency accepted the connection and
never answered — the usual Neon or Stripe stall). Treat a timeout as an outage
until `/status`, which races the same checks, says otherwise. The probe pages on
this path whether or not the mail is delivered, and always returns HTTP 500.

## Verifying the alert path (drill)

Run this after any change to the probe, the health checks, or the email
configuration. It is the only way to know the path still works, because a path
that is never exercised is indistinguishable from one that is broken.

1. Deploy a preview build.
2. Remove `DATABASE_URL` and `AGI_DATABASE_URL` from the preview environment.
   Both `environment` and `database` then report unhealthy, so overall status is
   `unhealthy` — the same state a real outage produces.
3. Invoke the probe with the deployment's cron secret (the schedule is daily, so
   do not wait for it):

   ```sh
   curl -i -H "Authorization: Bearer $CRON_SECRET" \
     https://<preview-deployment>/api/cron/health-probe
   ```

4. Expect `HTTP 200` and a body of
   `{"status":"unhealthy","alerted":true,"delivery":"delivered","severity":"critical"}`,
   and expect the mail in the fallback mailbox within a minute.
   - `delivery: "undeliverable"` with `HTTP 500` means the probe worked and the
     email channel did not. Fix `RESEND_API_KEY` / `AGI_SUPPORT_FROM_EMAIL`.
   - `HTTP 401` means `CRON_SECRET` does not match. The route is fail-closed and
     will also 401 when no secret is configured at all.
5. Restore the environment variables and redeploy the preview.

Local equivalent: `pnpm --filter @agiworkforce/web exec vitest run app/api/cron/health-probe`
covers the decision logic (severity split, undeliverable-is-a-failure,
harness-threw, hung-dependency) but not real delivery. It is not a substitute
for the drill.

## Open gaps

These cannot be closed by a commit. They are tracked as founder actions in
`ExecutionPlan.md` §Founder.

- **No pager.** No PagerDuty/Opsgenie/BetterStack account exists, so the alert
  is an email, not a page: nothing wakes anyone at 03:00 and nothing escalates
  if the first recipient does not acknowledge. Once a vendor is chosen, add its
  dispatch alongside the email in `dispatchAlert()` — the severity split and the
  undeliverable-is-a-failure behaviour already exist and should be reused.
- **No external uptime monitor.** Every detector above runs _inside_ the
  deployment being measured, so a deployment that fails to boot, a DNS failure,
  or a Vercel region outage is invisible to all of them. An external monitor
  polling `/api/health` from outside is the only detector that survives the
  platform being down, and it needs no code — `/api/health` is public and
  already returns 503 when core checks fail.
- **Daily cadence.** Tighten the `vercel.json` entry to a five-minute schedule
  the same day the Vercel project moves to Pro, and not before.
- **No on-call rotation.** One mailbox, one person, no handoff.

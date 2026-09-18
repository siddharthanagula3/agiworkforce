# Incident communication

Status: Current
Owner: Platform lead
Last updated: 2026-09-18

How an incident reaches responders and customers when the thing that is down is
this application. The response procedure itself is
`docs/runbooks/incident-response.md`; this runbook covers only the paths a
message travels and which of them share a dependency with the outage.

## The four paths, and what each one depends on

| Path             | Where it is                        | Depends on                       |
| ---------------- | ---------------------------------- | -------------------------------- |
| Responder email  | `sendSupportEmail`, Resend         | Resend, and this app to send it  |
| Pager webhook    | `PAGER_WEBHOOK_URL`                | this app reaching the webhook    |
| Incident channel | `INCIDENT_CHANNEL_WEBHOOK_URL`     | this app reaching the webhook    |
| Out of band      | `INCIDENT_OUT_OF_BAND_WEBHOOK_URL` | neither Resend nor this app's UI |

The first three all run inside `notifyIncident`, which the cron in this
deployment invokes. An outage that stops the cron stops all three at once. The
fourth is tried only when none of the first three reported delivery, and it
exists so that a single failed vendor is not a communications blackout.

**The out-of-band endpoint must satisfy both rules or it is not a fallback:**

1. It is not served by this deployment or by any project that shares its build.
2. It does not route through the email vendor.

A webhook at a second provider (an SMS gateway, a phone-vendor webhook, a
serverless function at a different host) satisfies both. A second Resend
template does not. A route in `apps/web` does not.

`INCIDENT_OUT_OF_BAND_TOKEN` is sent as a bearer token when set. The endpoint
should reject unauthenticated posts: anyone who can reach it can page the team.

## Customer-facing status

`/status` is served by the deployment it reports on. A platform-wide outage
takes it down with the thing it would report, which is the one moment it is
worth reading.

Set `AGI_STATUS_MIRROR_WRITE_URL` (and `AGI_STATUS_MIRROR_TOKEN`) to an origin
this deployment does not serve, such as an object-storage bucket behind its own
CDN. Every incident that reaches the out-of-band path also PUTs a snapshot
there. Set `AGI_STATUS_MIRROR_URL` to the public address of the same object;
`/status` links to it under "Where to read this when this page is down", and it
is the address to publish in support replies and release notes.

With neither set, the status page says so rather than implying a mirror exists.
That is the accepted-risk position, and it is only acceptable while no customer
contract promises status during an outage.

## Audit continuity

`auditStreamContinuity` (`apps/web/lib/services/audit-streaming-service.ts`)
reports, per workspace, how many audit events are held and how far behind the
receiver is. Events are never dropped when a SIEM is unreachable: a failed
delivery holds the cursor rather than advancing it, so the backlog stays in
`public.enterprise_audit_events` and is redelivered when the receiver returns. A
receiver may see repeats after an outage and deduplicates on the event id.

A destination more than `AUDIT_STREAM_CONTINUITY_ALERT_MINUTES` behind reports
`alerting: true`. That is a receiver that stopped reading, not data loss, so it
is a warning rather than a critical page.

After `AUDIT_STREAM_FAILURE_CEILING` consecutive failures the destination is
skipped for the run so one dead endpoint cannot starve the drain. It is skipped,
never disabled, and the backlog is untouched.

## Verifying the paths

Do this after any change to the alerting code or to either webhook.

1. Point `INCIDENT_OUT_OF_BAND_WEBHOOK_URL` at a request bin you control.
2. Unset the Resend API key in a preview environment so email reports
   undeliverable.
3. Fire the health probe. Expect `outOfBand: 'paged'` in the dispatch result,
   one POST at the bin, and no "no human has been told" error in the logs.
4. With `AGI_STATUS_MIRROR_WRITE_URL` set, expect a PUT carrying
   `status: 'disrupted'` for a critical alert.
5. Restore the key and confirm the fallback stops firing: it must not send on an
   incident that email already delivered.

`apps/web/lib/server/incident/__tests__/dispatch.test.ts` covers each of these
at unit level. Step 1 through 5 is what proves the endpoint on the other side is
real.

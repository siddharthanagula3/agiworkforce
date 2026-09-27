# Incident response: open gaps

Lifted on 2026-09-27 from the "Open gaps" section of `docs/runbooks/incident-response.md`. None can be closed by a commit. Delete a bullet when it is closed, and this file when none is left.

- **No pager vendor.** `PAGER_WEBHOOK_URL` is the seam and the dispatcher posts to it, but no PagerDuty, Opsgenie or BetterStack account exists, so unless that variable is set an alert is an email and a channel post. Choosing and paying for the vendor is a founder action (the paging vendor is part of the certification and vendor item in `audit/decisions/founder-actions.md`); no further code is needed to adopt one.
- **No external uptime monitor.** Every detector in the runbook runs inside the deployment being measured, so a deployment that fails to boot, a DNS failure or a Vercel region outage is invisible to all of them. An external monitor polling `/api/health` from outside is the only detector that survives the platform being down. It needs no code: `/api/health` is public and already returns 503 when core checks fail.
- **The rotation may be empty.** The on-call rotation is a deployment variable. If `AGI_ONCALL_ROTATION` is unset in production, coverage is one mailbox and whoever reads it, which is not 24/7 and is not claimed to be.

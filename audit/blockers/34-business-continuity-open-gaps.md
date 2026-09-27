# Business continuity: open gaps

Lifted on 2026-09-27 from "Known gaps, stated rather than covered" in `docs/runbooks/business-continuity.md`. The runbook keeps a one-line statement that these limits exist. Delete a bullet when it is closed, and this file when none is left.

- **No declared RPO or RTO commitment.** The reasons are in the runbook's "Recovery point and recovery time" section and in `31-database-backup-restore-open-gaps.md`.
- **Neon point-in-time recovery is untested.** The scheduled restore test is the host-neutral one, against a fresh container. Point-in-time recovery on the real project has no scheduled test and no dated evidence.
- **No second region and no second provider for serving.** A provider-wide outage is an outage, and the trust ledger says so.
- **No 24/7 on-call rotation.** Response is best effort during working hours, as `/status` states. See `32-incident-response-open-gaps.md`.
- **Object replication is bounded per run.** A large burst is not covered within the hour it was written.

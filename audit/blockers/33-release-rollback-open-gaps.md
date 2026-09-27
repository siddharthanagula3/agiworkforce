# Release rollback: open gaps

Lifted on 2026-09-27 from the "Open gaps" section of `docs/runbooks/release-rollback.md`. Delete a bullet when it is closed, and this file when none is left.

- **The rollback target is Vercel's, not the repository's.** If the platform has pruned the last healthy production deployment, there is nothing to roll back to, and the script refuses rather than picking something arbitrary. Fixing forward is then the only path. Closing this needs a rollback target the repository controls, such as a retained, rebuildable release artifact.
- **The audit write is best effort when the database is the outage.** With `AGI_DATABASE_URL` unreachable the rollback still happens, and the script warns that the trail was not written. The workflow run log is then the only record.

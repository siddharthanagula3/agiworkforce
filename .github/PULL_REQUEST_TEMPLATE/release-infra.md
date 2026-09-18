# Release Or Infrastructure Change

## Scope

-

## System

- [ ] GitHub Actions.
- [ ] Web/Vercel.
- [ ] Desktop/Tauri release.
- [ ] CLI release.
- [ ] Mobile store/build pipeline.
- [ ] Neon database.
- [ ] API gateway/signaling/managed compute.

## Operational Impact

-

## Migration Review

Required when `Neon database` is checked above. A migration merges on the
strength of this section, not on the header comment in the SQL file.

- Migration file:
- [ ] Reversible; the down path is written below.
- [ ] Forward-only; the reason it cannot be reversed:
- [ ] Safe against the previous deployment still serving traffic (no column or
      table the running build reads is dropped or renamed in this PR).
- [ ] `pnpm db:migrate -- verify` output attached.
- Migration reviewer (GitHub handle):

## Protected Configuration

- [ ] No GitHub ruleset or environment protection changed.
- [ ] `.github/rulesets/` changed; the applied state was re-read with
      `gh api repos/:owner/:repo/rulesets` and the diff between file and live
      state is stated below.

-

## Secrets / Credentials

- [ ] No secrets changed.
- [ ] Secrets changed; rotation/rollback documented below.

Details:

-

## Verification

- [ ] Dry run or local equivalent:
- [ ] CI workflow or deployment check:

## Rollback

The automatic revert in `.github/workflows/deploy-production.yml` returns the
Vercel alias to the previously serving deployment. It does not undo a migration,
a published release artifact, or a changed protected setting.

- Command or steps that undo this change:
- [ ] Nothing here needs a manual undo; the automatic revert covers it.
- [ ] A manual undo is needed and is written above.

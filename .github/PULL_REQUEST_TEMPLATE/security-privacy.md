# Security Or Privacy Change

## Threat / Risk

-

## Affected Trust Boundary

- [ ] Auth/session.
- [ ] Secrets/BYOK.
- [ ] Local to BYOK/Managed handoff.
- [ ] Billing/credits/refunds/fraud.
- [ ] File system or shell execution.
- [ ] Browser/native messaging.
- [ ] Generated files/artifacts/downloads.
- [ ] Database/RLS/migrations.
- [ ] Provider routing/retention/storage flags.

## Controls Added Or Changed

-

## Abuse / Regression Tests

- [ ] Negative test:
- [ ] Positive test:
- [ ] Manual verification:

## Review Requirements

A reviewer is a GitHub handle, not a checkbox. A line left blank is an
unreviewed trust-boundary change and is a reason to hold the merge.

- Security/privacy owner:
- Product owner, for user-visible consent or copy:
- Backend/platform owner, for service or provider changes:
- [ ] Database, RLS, or migration is checked above; the migration section of the
      release-infra template is filled in on this PR as well.

## Rollback

- Command or steps that undo this change:
- [ ] The control can be reverted without a data migration.
- [ ] Reverting needs the steps written above.

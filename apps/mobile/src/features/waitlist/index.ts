/**
 * Public barrel for the waitlist feature.
 *
 * Canonical entry point for any new caller. Existing callers using
 * `@/services/waitlist`, `@/stores/waitlistStore`, or
 * `@/components/waitlist/CloudWaitlistSheet` continue to work via the
 * temp barrels at those old paths — the long-term plan migrates them
 * here, then drops the temp barrels.
 *
 * Layer: features (per apps/mobile/src/README.md).
 * Owner: waitlist-engineer (per ~/.claude/plans/here-is-the-approved-ancient-clover.md).
 */
export * from './service';
export * from './store';
export * from './CloudWaitlistSheet';

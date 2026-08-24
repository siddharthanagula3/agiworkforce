import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB_ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(WEB_ROOT, p), 'utf-8');

/**
 * Account deletion now has a real self-serve cancel path
 * (`POST /api/user/delete-account/cancel`, nulling
 * `profiles.deletion_requested_at` / `deletion_scheduled_for` while the grace
 * window is open). This suite used to pin the opposite invariant — that no
 * cancel path existed and the dialog said so — and its own comment predicted
 * this exact change: "If a real cancel endpoint is ever added, this test
 * should fail and the dialog copy should be revisited in the same change."
 * This is that revisit: it now pins that the copy and the code agree that
 * cancellation is self-serve, and that the endpoint actually honours the
 * grace window rather than clearing the schedule unconditionally.
 */
describe('delete-account dialog matches what deletion actually does', () => {
  const dialog = read('features/settings/sections/AccountSection.tsx');
  const privacy = read('app/privacy/page.tsx');
  const cancelRoute = read('app/api/user/delete-account/cancel/route.ts');

  it('does not promise a grace window it cannot honour', () => {
    expect(dialog).not.toMatch(/grace window/i);
  });

  it('no longer tells the user cancellation requires contacting support', () => {
    expect(dialog).not.toMatch(/no self-serve way to cancel/i);
  });

  it('tells the user how to cancel: sign back in and use Settings > Account', () => {
    expect(dialog).toMatch(
      /sign\s+back\s+in\s+and\s+cancel\s+from\s+settings\s*(?:>|&gt;)\s*account/i,
    );
  });

  it('privacy policy agrees that cancellation is self-serve, not a support request', () => {
    expect(privacy).not.toMatch(/no self-serve way to cancel a scheduled deletion/i);
    expect(privacy).toMatch(/cancellation is self-serve/i);
  });

  it('the cancel endpoint actually nulls both deletion-schedule columns', () => {
    expect(cancelRoute).toMatch(/deletion_requested_at\s*=\s*null/i);
    expect(cancelRoute).toMatch(/deletion_scheduled_for\s*=\s*null/i);
  });

  it('the cancel endpoint only clears the schedule while it is still in the future', () => {
    // Cancelling after the grace window closes must not be able to resurrect
    // data the purge cron has already started erasing — the UPDATE has to be
    // conditioned on the schedule still being ahead of `now()`.
    expect(cancelRoute).toMatch(/deletion_scheduled_for\s*>\s*now\(\)/i);
  });
});

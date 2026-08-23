import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB_ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(WEB_ROOT, p), 'utf-8');

/**
 * The dialog promised a "24-hour grace window before deletion completes" while
 * the privacy policy stated there is no self-serve way to cancel a scheduled
 * deletion — and the code agreed with the policy: `deletion_scheduled_for` is
 * set on confirm and nulled nowhere, while device refresh blocks re-auth
 * immediately. Telling someone an irreversible action is reversible is the one
 * thing this dialog must never do.
 */
describe('delete-account dialog matches what deletion actually does', () => {
  const dialog = read('features/settings/sections/AccountSection.tsx');

  it('does not promise a grace window the product cannot honour', () => {
    expect(dialog).not.toMatch(/grace window/i);
  });

  it('states that cancellation is not self-serve', () => {
    expect(dialog).toMatch(/no self-serve way to cancel/i);
  });

  it('agrees with the privacy policy rather than contradicting it', () => {
    expect(read('app/privacy/page.tsx')).toMatch(/no self-serve way to cancel a scheduled deletion/i);
  });

  it('still has no code path that clears a scheduled deletion', () => {
    // If a real cancel endpoint is ever added, this test should fail and the
    // dialog copy should be revisited in the same change.
    const routes = [
      'app/api/user/delete-account/route.ts',
      'app/api/cron/purge-deleted-accounts/route.ts',
    ];
    for (const r of routes) {
      expect(read(r)).not.toMatch(/deletion_scheduled_for\s*=\s*null/i);
    }
  });
});

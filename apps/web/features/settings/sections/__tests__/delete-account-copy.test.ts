import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB_ROOT = join(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(join(WEB_ROOT, p), 'utf-8');

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
    expect(cancelRoute).toMatch(/deletion_scheduled_for\s*>\s*now\(\)/i);
  });
});

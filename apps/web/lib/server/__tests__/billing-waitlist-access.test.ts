import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { hasBillingWaitlistAccess } from '../billing-waitlist-access';

function db(granted: boolean) {
  return { query: vi.fn(async () => [{ granted }]) } as unknown as Parameters<
    typeof hasBillingWaitlistAccess
  >[0];
}

describe('hasBillingWaitlistAccess', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('admits only an account that redeemed an access code while staged', async () => {
    await expect(hasBillingWaitlistAccess(db(true), 'user-1')).resolves.toBe(true);
    await expect(hasBillingWaitlistAccess(db(false), 'user-1')).resolves.toBe(false);
  });

  it('admits every account once the owner opens paid upgrades', async () => {
    vi.stubEnv('AGI_BILLING_WAITLIST_OPEN', '1');
    const closed = db(false);

    await expect(hasBillingWaitlistAccess(closed, 'user-1')).resolves.toBe(true);
    expect((closed as unknown as { query: ReturnType<typeof vi.fn> }).query).not.toHaveBeenCalled();
  });

  it('stays staged for any value other than 1', async () => {
    vi.stubEnv('AGI_BILLING_WAITLIST_OPEN', 'true');
    await expect(hasBillingWaitlistAccess(db(false), 'user-1')).resolves.toBe(false);
  });
});

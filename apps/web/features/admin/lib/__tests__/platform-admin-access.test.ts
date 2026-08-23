import { describe, expect, it } from 'vitest';

import { isPlatformAdmin, parsePlatformAdminIds } from '@/features/admin/lib/platform-admin-access';
import { hasAdminConsoleAccess } from '@/features/admin/lib/admin-console-access';

describe('platform admin access', () => {
  it('denies everyone when the allowlist is unset or empty', () => {
    // The dashboard can reset another account's usage, so an unconfigured
    // deployment must fail closed rather than fall back to a role check.
    for (const raw of [undefined, null, '', '   ', ',,']) {
      expect(isPlatformAdmin('user_1', raw)).toBe(false);
    }
  });

  it('admits only the exact ids listed', () => {
    const raw = 'user_founder, user_ops ';
    expect(isPlatformAdmin('user_founder', raw)).toBe(true);
    expect(isPlatformAdmin('user_ops', raw)).toBe(true);
    expect(isPlatformAdmin('user_other', raw)).toBe(false);
    expect(isPlatformAdmin(null, raw)).toBe(false);
    expect(isPlatformAdmin(undefined, raw)).toBe(false);
  });

  it('does not treat a substring or prefix as a match', () => {
    expect(isPlatformAdmin('user_found', 'user_founder')).toBe(false);
    expect(isPlatformAdmin('user_founder_2', 'user_founder')).toBe(false);
  });

  it('parses a list without leaving blank entries behind', () => {
    expect(parsePlatformAdminIds('a, b ,, c,')).toEqual(['a', 'b', 'c']);
  });

  // The reason this gate exists at all. An organisation owner is an admin of
  // THEIR org, and the enterprise console is right to admit them. The operator
  // dashboard reads every account, so the two must not share a check.
  it('is strictly narrower than the organisation console gate', () => {
    const orgOwner = { role: 'owner' };
    expect(hasAdminConsoleAccess(orgOwner)).toBe(true);
    expect(isPlatformAdmin('user_customer', 'user_founder')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCKDOWN_PREFERENCES, parseLockdownEnabled } from '../lockdownMode';

describe('parseLockdownEnabled', () => {
  it('reads an explicit opt-in', () => {
    expect(parseLockdownEnabled({ lockdown: { enabled: true } })).toBe(true);
  });

  it('reads an explicit opt-out', () => {
    expect(parseLockdownEnabled({ lockdown: { enabled: false } })).toBe(false);
  });

  it('defaults to off for an account that never set it', () => {
    expect(DEFAULT_LOCKDOWN_PREFERENCES.enabled).toBe(false);
    for (const settings of [undefined, null, {}, { lockdown: {} }]) {
      expect(parseLockdownEnabled(settings)).toBe(false);
    }
  });

  it('reads a malformed value as off rather than locking the account out', () => {
    for (const settings of [
      { lockdown: { enabled: 'yes' } },
      { lockdown: 'on' },
      { lockdown: [] },
      'not an object',
      42,
    ]) {
      expect(parseLockdownEnabled(settings)).toBe(false);
    }
  });

  it('ignores the other namespaces sharing the settings blob', () => {
    expect(
      parseLockdownEnabled({
        'tool-approvals': { defaultPolicy: 'auto_approve_read_only' },
        lockdown: { enabled: true },
      }),
    ).toBe(true);
  });
});

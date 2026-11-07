import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockQuery = vi.hoisted(() => vi.fn());
const scopedDb = { query: mockQuery } as unknown as DatabaseAdapter;

import { readDeviceCodeSignInPolicy } from '../device-signin-policy';

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockReset();
});

describe('device-code sign-in policy', () => {
  it('defaults to enabled after a successful empty scoped read', async () => {
    mockQuery.mockResolvedValue([]);
    await expect(readDeviceCodeSignInPolicy(scopedDb, 'u1')).resolves.toBe('enabled');
  });

  it.each([{}, { other: false }, { security: {} }, { security: { other: false } }])(
    'defaults to enabled when the policy is absent from %j',
    async (settings) => {
      mockQuery.mockResolvedValue([{ settings }]);
      await expect(readDeviceCodeSignInPolicy(scopedDb, 'u1')).resolves.toBe('enabled');
    },
  );

  it.each([true, false])('honors the boolean policy %s', async (enabled) => {
    mockQuery.mockResolvedValue([{ settings: { security: { deviceCodeSignInEnabled: enabled } } }]);
    await expect(readDeviceCodeSignInPolicy(scopedDb, 'u1')).resolves.toBe(
      enabled ? 'enabled' : 'disabled',
    );
  });

  const malformed = [null, undefined, [], '', 'false', 0, false];
  it.each(malformed.map((value) => [value]))('rejects malformed settings %j', async (settings) => {
    mockQuery.mockResolvedValue([{ settings }]);
    await expect(readDeviceCodeSignInPolicy(scopedDb, 'u1')).resolves.toBe('unavailable');
  });

  it.each(malformed.map((value) => [value]))('rejects malformed security %j', async (security) => {
    mockQuery.mockResolvedValue([{ settings: { security } }]);
    await expect(readDeviceCodeSignInPolicy(scopedDb, 'u1')).resolves.toBe('unavailable');
  });

  it.each([null, undefined, [], {}, '', 'false', 0, 1].map((value) => [value]))(
    'rejects a present non-boolean policy %j',
    async (value) => {
      mockQuery.mockResolvedValue([{ settings: { security: { deviceCodeSignInEnabled: value } } }]);
      await expect(readDeviceCodeSignInPolicy(scopedDb, 'u1')).resolves.toBe('unavailable');
    },
  );

  it('refuses approval when the settings read throws', async () => {
    mockQuery.mockRejectedValue(new Error('connection lost'));
    await expect(readDeviceCodeSignInPolicy(scopedDb, 'u1')).resolves.toBe('unavailable');
  });

  it('scopes the read to the caller', async () => {
    mockQuery.mockResolvedValue([{ settings: {} }]);
    await readDeviceCodeSignInPolicy(scopedDb, 'u1');
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('where user_id = $1'), ['u1']);
  });
});

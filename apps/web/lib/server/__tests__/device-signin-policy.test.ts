import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockQuery = vi.hoisted(() => vi.fn());
const scopedDb = { query: mockQuery } as unknown as DatabaseAdapter;

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { isDeviceCodeSignInEnabled } from '../device-signin-policy';

beforeEach(() => vi.clearAllMocks());

// The switch must fail OPEN. Defaulting to off would sign every existing CLI
// and desktop install out at deploy, and refusing approvals because a settings
// query blipped would lock users out of their own devices.
describe('device-code sign-in policy', () => {
  it('is on for an account that never touched the setting', async () => {
    mockQuery.mockResolvedValue([{ settings: {} }]);
    await expect(isDeviceCodeSignInEnabled(scopedDb, 'u1')).resolves.toBe(true);
  });

  it('is on when the account has no settings row at all', async () => {
    mockQuery.mockResolvedValue([]);
    await expect(isDeviceCodeSignInEnabled(scopedDb, 'u1')).resolves.toBe(true);
  });

  it('is off only when explicitly set to false', async () => {
    mockQuery.mockResolvedValue([{ settings: { security: { deviceCodeSignInEnabled: false } } }]);
    await expect(isDeviceCodeSignInEnabled(scopedDb, 'u1')).resolves.toBe(false);
  });

  it('is on when explicitly set to true', async () => {
    mockQuery.mockResolvedValue([{ settings: { security: { deviceCodeSignInEnabled: true } } }]);
    await expect(isDeviceCodeSignInEnabled(scopedDb, 'u1')).resolves.toBe(true);
  });

  it('ignores a non-boolean value rather than treating it as off', async () => {
    mockQuery.mockResolvedValue([{ settings: { security: { deviceCodeSignInEnabled: 'no' } } }]);
    await expect(isDeviceCodeSignInEnabled(scopedDb, 'u1')).resolves.toBe(true);
  });

  it('fails open when the settings read throws', async () => {
    mockQuery.mockRejectedValue(new Error('connection lost'));
    await expect(isDeviceCodeSignInEnabled(scopedDb, 'u1')).resolves.toBe(true);
  });

  it('scopes the read to the caller', async () => {
    mockQuery.mockResolvedValue([{ settings: {} }]);
    await isDeviceCodeSignInEnabled(scopedDb, 'u1');
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['u1']);
  });
});

describe('the approval route enforces it', () => {
  it('refuses approval when the account turned device sign-in off', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(
      join(process.cwd(), 'app/api/auth/device/approve/route.ts'),
      'utf8',
    );

    expect(source).toContain('isDeviceCodeSignInEnabled(approverDb, authUser.userId)');
    expect(source).toContain('DEVICE_SIGNIN_DISABLED');
    // Enforced before terms and before the row is marked approved: an approval
    // recorded and then refused would leave a device believing it is pending.
    expect(source.indexOf('isDeviceCodeSignInEnabled')).toBeLessThan(
      source.indexOf('hasAcceptedCurrentTerms(authUser.userId)'),
    );
  });
});

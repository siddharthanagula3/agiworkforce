import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
  requireCurrentTermsAcceptance: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: (...args: unknown[]) => mocks.auth(...args) }));
vi.mock('next/headers', () => ({ headers: (...args: unknown[]) => mocks.headers(...args) }));
vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mocks.redirect(...args),
}));
vi.mock('@/lib/server/require-current-terms', () => ({
  requireCurrentTermsAcceptance: (...args: unknown[]) =>
    mocks.requireCurrentTermsAcceptance(...args),
}));

import BillingLayout from '../billing/layout';
import SettingsLayout from '../settings/layout';

describe('protected Web terms layouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user-1' });
    mocks.headers.mockResolvedValue(new Headers({ 'x-agi-pathname': '/settings/security' }));
    mocks.requireCurrentTermsAcceptance.mockResolvedValue(undefined);
  });

  it('enforces current terms before rendering billing', async () => {
    await BillingLayout({ children: 'billing' });

    expect(mocks.requireCurrentTermsAcceptance).toHaveBeenCalledWith('user-1', '/billing');
  });

  it('enforces current terms and preserves the exact settings return path', async () => {
    await SettingsLayout({ children: 'settings' });

    expect(mocks.requireCurrentTermsAcceptance).toHaveBeenCalledWith(
      'user-1',
      '/settings/security',
    );
  });
});

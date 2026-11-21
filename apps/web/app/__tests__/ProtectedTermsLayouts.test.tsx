import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
  requireCurrentTermsAcceptance: vi.fn(),
  adultEligibility: vi.fn(),
  getRequestIdentity: vi.fn(),
  assertAccountActive: vi.fn(),
  resolveOrgMembership: vi.fn(),
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
vi.mock('@/lib/server/adult-eligibility', async (importOriginal) => ({
  ...(await importOriginal()),
  readAdultEligibilityState: (...args: unknown[]) => mocks.adultEligibility(...args),
}));
vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal()),
  getRequestIdentity: (...args: unknown[]) => mocks.getRequestIdentity(...args),
}));
vi.mock('@/lib/api-auth', () => ({
  assertAccountActive: (...args: unknown[]) => mocks.assertAccountActive(...args),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/services/org-sharing-service', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveOrgMembership: (...args: unknown[]) => mocks.resolveOrgMembership(...args),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/features/workspace-console/components/WorkspaceConsoleShell', () => ({
  WorkspaceConsoleShell: ({ children }: { children: unknown }) => children,
}));
vi.mock('../ProductRuntimeProviders', () => ({
  default: ({ children }: { children: unknown }) => children,
}));

import BillingLayout from '../billing/layout';
import CodeLayout from '../code/layout';
import SettingsLayout from '../settings/layout';
import WorkspaceConsoleLayout from '../workspace/layout';

describe('protected Web terms layouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockReset();
    mocks.auth.mockResolvedValue({ userId: 'user-1' });
    mocks.headers.mockResolvedValue(new Headers({ 'x-agi-pathname': '/settings/security' }));
    mocks.requireCurrentTermsAcceptance.mockResolvedValue(undefined);
    mocks.adultEligibility.mockResolvedValue('confirmed');
    mocks.getRequestIdentity.mockResolvedValue({ subject: 'user-1' });
    mocks.assertAccountActive.mockResolvedValue(undefined);
    mocks.resolveOrgMembership.mockResolvedValue(null);
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

  describe.each(['unconfirmed', 'ineligible'])(
    'for an account whose age decision is %s',
    (state) => {
      beforeEach(() => {
        mocks.adultEligibility.mockResolvedValue(state);
      });

      it('still opens billing, so the account can reach its subscription', async () => {
        await BillingLayout({ children: 'billing' });

        expect(mocks.adultEligibility).not.toHaveBeenCalled();
        expect(mocks.redirect).not.toHaveBeenCalled();
      });

      it('still opens settings, so the account can reach its data export and deletion', async () => {
        await SettingsLayout({ children: 'settings' });

        expect(mocks.adultEligibility).not.toHaveBeenCalled();
        expect(mocks.redirect).not.toHaveBeenCalled();
      });

      it('sends the account away from the code surface to the review screen and back to the exact path', async () => {
        mocks.headers.mockResolvedValue(new Headers({ 'x-agi-pathname': '/code/session-1' }));
        mocks.redirect.mockImplementation(() => {
          throw new Error('NEXT_REDIRECT');
        });

        await expect(CodeLayout({ children: 'code' })).rejects.toThrow('NEXT_REDIRECT');

        expect(mocks.adultEligibility).toHaveBeenCalledWith('user-1');
        expect(mocks.redirect).toHaveBeenCalledWith(
          '/login/complete?redirectTo=%2Fcode%2Fsession-1',
        );
      });

      it('sends the account away from the workspace console before reading its status or membership', async () => {
        mocks.redirect.mockImplementation(() => {
          throw new Error('NEXT_REDIRECT');
        });

        await expect(WorkspaceConsoleLayout({ children: 'workspace' })).rejects.toThrow(
          'NEXT_REDIRECT',
        );

        expect(mocks.redirect).toHaveBeenCalledWith('/login/complete?redirectTo=%2Fworkspace');
        expect(mocks.assertAccountActive).not.toHaveBeenCalled();
        expect(mocks.resolveOrgMembership).not.toHaveBeenCalled();
      });
    },
  );

  it('opens the code surface and the workspace console for a confirmed account', async () => {
    mocks.headers.mockResolvedValue(new Headers({ 'x-agi-pathname': '/code/session-1' }));

    await CodeLayout({ children: 'code' });
    await WorkspaceConsoleLayout({ children: 'workspace' });

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.assertAccountActive).toHaveBeenCalledWith('user-1');
  });
});

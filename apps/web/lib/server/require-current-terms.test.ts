import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasAcceptedCurrentTerms: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mocks.redirect(...args),
}));
vi.mock('@/lib/server/terms', () => ({
  hasAcceptedCurrentTerms: (...args: unknown[]) => mocks.hasAcceptedCurrentTerms(...args),
}));

import { requireCurrentTermsAcceptance } from './require-current-terms';

describe('requireCurrentTermsAcceptance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not interrupt an account already on the current revision', async () => {
    mocks.hasAcceptedCurrentTerms.mockResolvedValue(true);

    await requireCurrentTermsAcceptance('user-1', '/chat/session-1?panel=files');

    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('sends missing or outdated accounts through fresh acceptance and back to their route', async () => {
    mocks.hasAcceptedCurrentTerms.mockResolvedValue(false);

    await requireCurrentTermsAcceptance('user-1', '/chat/session-1?panel=files');

    expect(mocks.redirect).toHaveBeenCalledWith(
      '/login/complete?redirectTo=%2Fchat%2Fsession-1%3Fpanel%3Dfiles',
    );
  });
});

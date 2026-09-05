import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeNeonDb } from './helpers/fake-neon-db';

const mocks = vi.hoisted(() => ({
  db: null as ReturnType<typeof import('./helpers/fake-neon-db').createFakeNeonDb> | null,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mocks.db!.adapter }));

import { isVerificationEmailSendable } from '../availability';
import { listAvailableSupportActions, proposeSupportAction } from '../service';

describe('support actions, unavailable capabilities fail closed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db = createFakeNeonDb();
  });

  it('reports verification email as unsendable in this deployment', () => {
    expect(isVerificationEmailSendable()).toBe(false);
  });

  it('does not offer resend_verification_email, and says why', () => {
    const listed = listAvailableSupportActions();
    expect(listed.actions.map((a) => a.id)).not.toContain('resend_verification_email');

    const entry = listed.unavailable.find((a) => a.id === 'resend_verification_email');
    expect(entry).toBeDefined();
    expect(entry!.reason).toMatch(/cannot send verification email/iu);
    expect(entry!.reason).toMatch(/account settings/iu);
  });

  it('refuses a direct proposal for it, and writes no proposal row', async () => {
    await expect(
      proposeSupportAction({
        db: mocks.db!.adapter,
        userId: 'user_a',
        actionId: 'resend_verification_email',
        params: {},
        surface: 'web',
        conversationRef: null,
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_ACTION_UNAVAILABLE' });

    expect(mocks.db!.proposals).toHaveLength(0);
    expect(mocks.db!.callsMatching(/insert into public\.support_action_proposals/iu)).toHaveLength(
      0,
    );
  });

  it('does not offer the billing portal when this deployment has no Stripe key', () => {
    const previous = process.env['STRIPE_SECRET_KEY'];
    delete process.env['STRIPE_SECRET_KEY'];
    try {
      const listed = listAvailableSupportActions();
      expect(listed.actions.map((a) => a.id)).not.toContain('open_billing_portal');
      expect(listed.unavailable.map((a) => a.id)).toContain('open_billing_portal');
    } finally {
      if (previous === undefined) delete process.env['STRIPE_SECRET_KEY'];
      else process.env['STRIPE_SECRET_KEY'] = previous;
    }
  });
});

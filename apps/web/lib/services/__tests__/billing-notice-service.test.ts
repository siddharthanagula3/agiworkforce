import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONTACT_EMAIL,
  LEGAL_ENTITY,
  NOTICE_ADDRESS,
  UNSUBSCRIBE_SUBJECT,
  contactMailto,
} from '@/lib/legal-constants';
import { TRANSACTIONAL_EMAIL_FOOTER_STYLE } from '@/lib/services/notification-email-service';
type ResendClient = typeof import('@/lib/support/handoff/resend-client');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  send: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/support/handoff/resend-client', async (importOriginal) => ({
  ...(await importOriginal<ResendClient>()),
  sendTransactionalEmail: (...args: unknown[]) => mocks.send(...args),
}));

import { emailBillingNotice, type BillingNotice } from '../billing-notice-service';

const db = { query: mocks.query, execute: vi.fn() } as never;
const UNSUBSCRIBE = contactMailto(UNSUBSCRIBE_SUBJECT);

const NOTICE: BillingNotice = {
  userId: 'user-1',
  title: 'You can now upgrade to Pro',
  message: 'Paid upgrades are open on AGI, and you can upgrade now.',
  target: { kind: 'settings', id: 'billing' },
  dedupeKey: 'upgrade-waitlist-open:user-1',
  action: { label: 'See plans', url: 'https://agiworkforce.com/pricing' },
};

const REASON =
  'You are receiving this because you joined the AGI waitlist for Pro. It is the only email about that waitlist.';

function sentEmail() {
  return mocks.send.mock.calls[0]?.[0] as {
    text: string;
    html: string;
    replyTo?: string;
    headers?: Record<string, string>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_API_KEY', 're_test_key');
  vi.stubEnv('AGI_NOTIFICATIONS_FROM_EMAIL', 'notifications@agiworkforce.com');
  mocks.query.mockResolvedValue([{ email: 'ada@example.com' }]);
  mocks.send.mockResolvedValue({ delivered: true, providerMessageId: 'msg-1' });
});

afterEach(() => vi.unstubAllEnvs());

describe('emailBillingNotice', () => {
  it('sends an account notice with no promotional footer, reply address or list header', async () => {
    await emailBillingNotice(db, NOTICE);

    expect(mocks.send).toHaveBeenCalledWith({
      from: 'notifications@agiworkforce.com',
      to: 'ada@example.com',
      subject: NOTICE.title,
      text: `${NOTICE.message}\n\nSee plans: https://agiworkforce.com/pricing`,
      html: `<p>${NOTICE.message}</p><p><a href="https://agiworkforce.com/pricing">See plans</a></p>`,
      idempotencyKey: NOTICE.dedupeKey,
    });
  });

  it('says why a promotional notice came, how to stop such mail and who sent it', async () => {
    await emailBillingNotice(db, { ...NOTICE, promotion: { reason: REASON } });

    const email = sentEmail();
    const footer = email.text.split('\n\n').slice(2);
    expect(footer[0]).toBe(REASON);
    expect(footer[1]).toContain('unsubscribe');
    expect(footer[1]).toContain(CONTACT_EMAIL);
    expect(footer[2]).toBe(`${LEGAL_ENTITY}, ${NOTICE_ADDRESS}`);
    expect(email.html).toContain(`<p style="${TRANSACTIONAL_EMAIL_FOOTER_STYLE}">${REASON}</p>`);
    expect(email.html).toContain(`<a href="${UNSUBSCRIBE}">Unsubscribe</a>`);
    expect(email.html).toContain(`${LEGAL_ENTITY}, ${NOTICE_ADDRESS}`);
    expect(email.headers).toEqual({ 'List-Unsubscribe': `<${UNSUBSCRIBE}>` });
    expect(email.replyTo).toBe(CONTACT_EMAIL);
  });
});

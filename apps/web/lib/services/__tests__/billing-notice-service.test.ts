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
type ConsentRecords = typeof import('@/lib/server/consent-records');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  send: vi.fn(),
  readLatestConsent: vi.fn(),
  recordConsent: vi.fn(),
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

vi.mock('@/lib/server/consent-records', async (importOriginal) => ({
  ...(await importOriginal<ConsentRecords>()),
  readLatestConsent: (...args: unknown[]) => mocks.readLatestConsent(...args),
  recordConsent: (...args: unknown[]) => mocks.recordConsent(...args),
}));

import {
  MARKETING_EMAIL_UNSUBSCRIBE_LINK_DAYS,
  ONE_CLICK_UNSUBSCRIBE_POST,
  emailBillingNotice,
  marketingEmailUnsubscribeUrl,
  readMarketingEmailUnsubscribeToken,
  unsubscribeFromMarketingEmail,
  type BillingNotice,
} from '../billing-notice-service';

const SIGNING_SECRET = 'marketing-unsubscribe-signing-secret-0123456789';
const DAY_MS = 24 * 60 * 60 * 1000;

function tokenOf(url: string): string {
  return new URL(url).searchParams.get('token') ?? '';
}

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

  it('falls back to the reply address when no unsubscribe link can be signed', async () => {
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

describe('one-click marketing email unsubscribe', () => {
  beforeEach(() => {
    vi.stubEnv('CSRF_SECRET', SIGNING_SECRET);
    mocks.readLatestConsent.mockResolvedValue(null);
    mocks.recordConsent.mockResolvedValue({});
  });

  it('puts a signed one-click link in the footer and the RFC 8058 list headers', async () => {
    await emailBillingNotice(db, { ...NOTICE, promotion: { reason: REASON } });

    const email = sentEmail();
    const match = /<a href="([^"]+)">Unsubscribe<\/a>/.exec(email.html);
    const href = (match?.[1] ?? '').replaceAll('&amp;', '&');
    expect(new URL(href).pathname).toBe('/api/email/unsubscribe');
    expect(readMarketingEmailUnsubscribeToken(tokenOf(href))).toBe('user-1');
    expect(email.text).toContain(`Unsubscribe: ${href}`);
    expect(email.headers).toEqual({
      'List-Unsubscribe': `<${href}>, <${UNSUBSCRIBE}>`,
      'List-Unsubscribe-Post': ONE_CLICK_UNSUBSCRIBE_POST,
    });
  });

  it('keeps the link working for its whole lifetime and refuses it after', () => {
    const issuedAt = Date.parse('2026-10-22T00:00:00.000Z');
    const token = tokenOf(marketingEmailUnsubscribeUrl('user-1', issuedAt) ?? '');
    const lifetime = MARKETING_EMAIL_UNSUBSCRIBE_LINK_DAYS * DAY_MS;
    expect(readMarketingEmailUnsubscribeToken(token, issuedAt + lifetime - 1000)).toBe('user-1');
    expect(readMarketingEmailUnsubscribeToken(token, issuedAt + lifetime)).toBeNull();
  });

  it('refuses a token whose payload was changed or that was signed with another key', () => {
    const token = tokenOf(marketingEmailUnsubscribeUrl('user-1') ?? '');
    const [payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as {
      userId: string;
    };
    expect(claims.userId).toBe('user-1');
    const forged = Buffer.from(JSON.stringify({ ...claims, userId: 'user-2' })).toString(
      'base64url',
    );
    expect(readMarketingEmailUnsubscribeToken(`${forged}.${signature}`)).toBeNull();

    vi.stubEnv('CSRF_SECRET', 'a-different-signing-secret-0123456789abcdef');
    expect(readMarketingEmailUnsubscribeToken(token)).toBeNull();
  });

  it('records a withdrawn marketing email consent for the account the link names', async () => {
    const token = tokenOf(marketingEmailUnsubscribeUrl('user-1') ?? '');

    await expect(unsubscribeFromMarketingEmail(token)).resolves.toBe('unsubscribed');

    expect(mocks.readLatestConsent).toHaveBeenCalledWith('user-1', 'marketing_email');
    expect(mocks.recordConsent).toHaveBeenCalledWith({
      subject: { kind: 'user', userId: 'user-1' },
      purpose: 'marketing_email',
      granted: false,
      surface: 'email-unsubscribe',
    });
  });

  it('writes nothing more when the account has already withdrawn it', async () => {
    mocks.readLatestConsent.mockResolvedValue({ purpose: 'marketing_email', granted: false });
    const token = tokenOf(marketingEmailUnsubscribeUrl('user-1') ?? '');

    await expect(unsubscribeFromMarketingEmail(token)).resolves.toBe('unsubscribed');

    expect(mocks.recordConsent).not.toHaveBeenCalled();
  });

  it('writes nothing for a missing or invalid token', async () => {
    await expect(unsubscribeFromMarketingEmail(null)).resolves.toBe('invalid');
    await expect(unsubscribeFromMarketingEmail('not.a-token')).resolves.toBe('invalid');
    expect(mocks.readLatestConsent).not.toHaveBeenCalled();
    expect(mocks.recordConsent).not.toHaveBeenCalled();
  });
});

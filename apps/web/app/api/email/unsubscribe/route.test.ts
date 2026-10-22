import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
type RateLimitModule = typeof import('@/lib/rate-limit');
type BillingNoticeModule = typeof import('@/lib/services/billing-notice-service');

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  readMarketingEmailUnsubscribeToken: vi.fn(),
  unsubscribeFromMarketingEmail: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/services/billing-notice-service', async (importOriginal) => ({
  ...(await importOriginal<BillingNoticeModule>()),
  readMarketingEmailUnsubscribeToken: mocks.readMarketingEmailUnsubscribeToken,
  unsubscribeFromMarketingEmail: mocks.unsubscribeFromMarketingEmail,
}));

import { GET, POST } from './route';

const TOKEN = 'signed.unsubscribe-token';
const URL_WITH_TOKEN = `https://agiworkforce.com/api/email/unsubscribe?token=${encodeURIComponent(TOKEN)}`;
const ONE_CLICK = 'List-Unsubscribe=One-Click';

function get(url = URL_WITH_TOKEN) {
  return new NextRequest(url, { method: 'GET' });
}

function post(body: string, url = URL_WITH_TOKEN) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.readMarketingEmailUnsubscribeToken.mockReturnValue('user-1');
  mocks.unsubscribeFromMarketingEmail.mockResolvedValue('unsubscribed');
});

describe('GET /api/email/unsubscribe', () => {
  it('shows a one-button confirmation and changes nothing, so a link scanner unsubscribes no one', async () => {
    const response = await GET(get());
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(html).toContain('<form method="post"');
    expect(html).toContain(`?token=${encodeURIComponent(TOKEN)}`);
    expect(html).toContain('name="List-Unsubscribe" value="One-Click"');
    expect(html).toContain('>Unsubscribe</button>');
    expect(html).not.toContain('user-1');
    expect(mocks.unsubscribeFromMarketingEmail).not.toHaveBeenCalled();
  });

  it('points an expired or forged link to Settings without saying whose it was', async () => {
    mocks.readMarketingEmailUnsubscribeToken.mockReturnValue(null);
    const response = await GET(get());
    const html = await response.text();

    expect(response.status).toBe(400);
    expect(html).toContain('This link has expired.');
    expect(html).toContain('<a href="/settings/privacy">Settings &gt; Privacy</a>');
    expect(html).not.toContain('<form');
  });

  it('treats a missing token as expired', async () => {
    mocks.readMarketingEmailUnsubscribeToken.mockReturnValue(null);
    const response = await GET(get('https://agiworkforce.com/api/email/unsubscribe'));
    expect(response.status).toBe(400);
    expect(mocks.readMarketingEmailUnsubscribeToken).toHaveBeenCalledWith(null);
  });
});

describe('POST /api/email/unsubscribe', () => {
  it('unsubscribes at once on an RFC 8058 one-click post', async () => {
    const response = await POST(post(ONE_CLICK));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(mocks.unsubscribeFromMarketingEmail).toHaveBeenCalledWith(TOKEN);
    expect(html).toContain('unsubscribed from marketing email.');
    expect(html).not.toContain('user-1');
  });

  it('refuses a post without the one-click body and writes nothing', async () => {
    const response = await POST(post('something=else'));
    expect(response.status).toBe(400);
    expect(mocks.unsubscribeFromMarketingEmail).not.toHaveBeenCalled();
  });

  it('shows the expired page when the token does not verify', async () => {
    mocks.unsubscribeFromMarketingEmail.mockResolvedValue('invalid');
    const response = await POST(post(ONE_CLICK));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('This link has expired.');
  });

  it('says the change was not saved when the write fails', async () => {
    mocks.unsubscribeFromMarketingEmail.mockRejectedValue(new Error('db down'));
    const response = await POST(post(ONE_CLICK));
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('That change was not saved. Try again.');
  });

  it('stops at the rate limit before reading the token', async () => {
    mocks.withRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    const response = await POST(post(ONE_CLICK));
    expect(response.status).toBe(429);
    expect(mocks.unsubscribeFromMarketingEmail).not.toHaveBeenCalled();
  });
});

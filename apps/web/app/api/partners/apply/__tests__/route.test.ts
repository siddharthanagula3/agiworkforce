import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  sendSupportEmail: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/api-auth', () => ({ getOptionalAuthUser: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/support/handoff/config', () => ({
  getHandoffConfig: () => ({ fallbackEmail: 'partners-inbox@example.com' }),
}));
vi.mock('@/lib/support/handoff/resend-client', () => ({
  sendSupportEmail: mocks.sendSupportEmail,
}));

const { POST } = await import('../route');

const APPLICATION = {
  fullName: 'Ada Lovelace',
  email: 'Ada@Example.com',
  company: 'Analytical Engines Ltd',
  website: 'https://example.com',
  kind: 'integration',
  message: 'We maintain an MCP server for engineering notebooks and want it listed.',
};

function post(body: unknown) {
  return new NextRequest('https://agiworkforce.com/api/partners/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.sendSupportEmail.mockReset();
});

describe('POST /api/partners/apply', () => {
  it('sends the application to the team inbox with a reply-to and returns a reference', async () => {
    mocks.sendSupportEmail.mockResolvedValue({ delivered: true });

    const response = await POST(post(APPLICATION));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { reference: string };
    expect(body.reference).toMatch(/^PA-[0-9A-F]{10}$/);
    const [email] = mocks.sendSupportEmail.mock.calls[0]!;
    expect(email.to).toBe('partners-inbox@example.com');
    expect(email.replyTo).toBe('ada@example.com');
    expect(email.text).toContain('An integration, MCP server or plugin');
    expect(email.text).toContain(body.reference);
  });

  it('says the application was not sent when the inbox cannot be reached', async () => {
    mocks.sendSupportEmail.mockResolvedValue({ delivered: false, reason: 'not_configured' });

    const response = await POST(post(APPLICATION));

    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain('could not be sent right now');
  });

  it('refuses an incomplete application without sending anything', async () => {
    const response = await POST(post({ ...APPLICATION, message: 'too short' }));

    expect(response.status).toBe(400);
    expect(mocks.sendSupportEmail).not.toHaveBeenCalled();
  });
});

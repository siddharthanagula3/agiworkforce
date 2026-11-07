import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionalEmailInput } from '@/lib/support/handoff/resend-client';
import { escapeHtml } from '@/lib/html-escape';

const mocks = vi.hoisted(() => ({ send: vi.fn(), warn: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { warn: mocks.warn } }));
vi.mock('@/lib/support/handoff/resend-client', () => ({ sendTransactionalEmail: mocks.send }));

import { sendAccountSecurityEnabledEmail } from '../notification-email-service';

const input = {
  to: 'owner@example.test',
  undoUrl: 'https://example.test/login/not-me#fixture-only&<link>',
  undoExpiresAt: 'fixture expiry <UTC>',
  idempotencyKey: 'enrollment-email-fixture',
};
const summary =
  'Advanced Account Security was turned on for your AGI account. Every sign-in now needs one of the passkeys or security keys that were added, and your other devices were signed out.';
const undo = `If this was not you, use the link below to turn off Advanced Account Security without a passkey. This permanently removes its recovery keys and the saved passkey and security-key registrations that existed when it was turned on. Session sign-out and password protection are attempted, but account recovery may need further attention. Review your sign-in methods and active sessions afterwards. The link works until ${input.undoExpiresAt}.`;
const ignore = 'If it was you, you can ignore this email.';

// Preserving the unrelated enrollment summary is not evidence for its sign-out claim.
describe('enabled email undo-specific presentation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('RESEND_API_KEY', 'fixture-not-a-real-api-key');
    vi.stubEnv('AGI_NOTIFICATIONS_FROM_EMAIL', 'security@example.test');
    mocks.send.mockResolvedValue({ delivered: true, providerMessageId: 'message-fixture' });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('bounds undo claims while preserving recipient, transport, link and other content', async () => {
    await expect(sendAccountSecurityEnabledEmail(input)).resolves.toEqual({
      delivered: true,
      providerMessageId: 'message-fixture',
    });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    const message = mocks.send.mock.calls[0]![0] as TransactionalEmailInput;
    expect(message).toEqual({
      from: 'security@example.test',
      to: input.to,
      subject: 'Was this you? Advanced Account Security was turned on',
      text: [summary, '', undo, input.undoUrl, '', ignore].join('\n'),
      html: [
        `<p>${escapeHtml(summary)}</p>`,
        `<p>${escapeHtml(undo)}</p>`,
        `<p><a href="${escapeHtml(input.undoUrl)}">This was not me: turn it off</a></p>`,
        `<p style="color:#666;font-size:12px">${escapeHtml(ignore)}</p>`,
      ].join(''),
      idempotencyKey: input.idempotencyKey,
    });
    expect(undo).not.toMatch(/signs everyone out|resets your password|choose a new password/i);
    expect(message.html).toContain('fixture-only&amp;&lt;link&gt;');
    expect(message.html).toContain('fixture expiry &lt;UTC&gt;');
  });

  it('keeps the not-configured transport guard', async () => {
    vi.stubEnv('RESEND_API_KEY', '');

    await expect(sendAccountSecurityEnabledEmail(input)).resolves.toMatchObject({
      delivered: false,
      reason: 'not_configured',
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('returns the existing transport failure and warning without retrying', async () => {
    const failure = { delivered: false, reason: 'rejected', detail: 'fixture rejection' };
    mocks.send.mockResolvedValue(failure);

    await expect(sendAccountSecurityEnabledEmail(input)).resolves.toEqual(failure);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalledWith(
      { reason: 'rejected' },
      '[notifications] account security undo email failed',
    );
  });
});

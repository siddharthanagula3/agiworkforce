import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { recordAuditEvent } = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/security-audit', () => ({ recordAuditEvent }));

process.env['CSRF_SECRET'] = 'step-up-test-secret-that-is-long-enough-32';

import {
  requireStepUp,
  isStepUpRequiredError,
  STEP_UP_TOKEN_HEADER,
} from '@/lib/server/step-up-auth';
import { createStepUpGrant, resetStepUpSigningKeyCache } from '@/lib/server/step-up/grant-token';

const USER = 'user_owner';
const ORG = '11111111-1111-4111-8111-111111111111';
const ACTION = 'organization.transfer_ownership' as const;

function requestWith(token?: string): Request {
  return new Request('http://localhost:3000/api/settings/organization/transfer-ownership', {
    method: 'POST',
    headers: token ? { [STEP_UP_TOKEN_HEADER]: token } : {},
  });
}

function requirement(request: Request) {
  return {
    userId: USER,
    action: ACTION,
    resourceId: ORG,
    organizationId: ORG,
    request,
    endpoint: '/api/settings/organization/transfer-ownership',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStepUpSigningKeyCache();
});

describe('requireStepUp', () => {
  it('refuses a session that has not re-authenticated and records the challenge', async () => {
    await expect(requireStepUp(requirement(requestWith()))).rejects.toSatisfy(
      isStepUpRequiredError,
    );

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'step_up_challenged',
        outcome: 'denied',
        userId: USER,
        detail: expect.objectContaining({ resourceId: ACTION, reason: 'missing' }),
      }),
    );
  });

  it('accepts a proof minted for this user, action and workspace', async () => {
    const { token } = createStepUpGrant({
      userId: USER,
      action: ACTION,
      resourceId: ORG,
      method: 'totp',
    });

    const payload = await requireStepUp(requirement(requestWith(token)));

    expect(payload.method).toBe('totp');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'step_up_satisfied',
        detail: expect.objectContaining({ resourceId: ACTION, source: 'totp' }),
      }),
    );
  });

  it('refuses a proof minted for another workspace', async () => {
    const { token } = createStepUpGrant({
      userId: USER,
      action: ACTION,
      resourceId: '22222222-2222-4222-8222-222222222222',
      method: 'totp',
    });

    await expect(requireStepUp(requirement(requestWith(token)))).rejects.toSatisfy(
      isStepUpRequiredError,
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ reason: 'subject_mismatch' }) }),
    );
  });

  it('refuses a proof minted for another account', async () => {
    const { token } = createStepUpGrant({
      userId: 'user_someone_else',
      action: ACTION,
      resourceId: ORG,
      method: 'totp',
    });

    await expect(requireStepUp(requirement(requestWith(token)))).rejects.toSatisfy(
      isStepUpRequiredError,
    );
  });

  it('refuses a proof minted for a different action', async () => {
    const { token } = createStepUpGrant({
      userId: USER,
      action: 'account.delete',
      resourceId: ORG,
      method: 'totp',
    });

    await expect(requireStepUp(requirement(requestWith(token)))).rejects.toSatisfy(
      isStepUpRequiredError,
    );
  });

  it('refuses a proof once its freshness window has passed', async () => {
    const mintedAt = Date.UTC(2026, 8, 18, 12, 0, 0);
    const { token, expiresAt } = createStepUpGrant(
      { userId: USER, action: ACTION, resourceId: ORG, method: 'totp' },
      mintedAt,
    );
    expect(expiresAt).toBe(mintedAt + 300_000);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(expiresAt - 1));
      await expect(requireStepUp(requirement(requestWith(token)))).resolves.toMatchObject({
        action: ACTION,
      });

      vi.setSystemTime(new Date(expiresAt + 1));
      await expect(requireStepUp(requirement(requestWith(token)))).rejects.toSatisfy(
        isStepUpRequiredError,
      );
      expect(recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ detail: expect.objectContaining({ reason: 'expired' }) }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses a proof whose payload was edited after signing', async () => {
    const { token } = createStepUpGrant({
      userId: USER,
      action: ACTION,
      resourceId: ORG,
      method: 'totp',
    });
    const [payload, signature] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as {
      expiresAt: number;
    };
    decoded.expiresAt += 86_400_000;
    const forged = `${Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url')}.${signature}`;

    await expect(requireStepUp(requirement(requestWith(forged)))).rejects.toSatisfy(
      isStepUpRequiredError,
    );
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ reason: 'signature' }) }),
    );
  });

  it('refuses a proof signed with a different secret', async () => {
    const { token } = createStepUpGrant({
      userId: USER,
      action: ACTION,
      resourceId: ORG,
      method: 'totp',
    });

    process.env['CSRF_SECRET'] = 'a-completely-different-secret-value-of-32';
    resetStepUpSigningKeyCache();
    try {
      await expect(requireStepUp(requirement(requestWith(token)))).rejects.toSatisfy(
        isStepUpRequiredError,
      );
    } finally {
      process.env['CSRF_SECRET'] = 'step-up-test-secret-that-is-long-enough-32';
      resetStepUpSigningKeyCache();
    }
  });
});

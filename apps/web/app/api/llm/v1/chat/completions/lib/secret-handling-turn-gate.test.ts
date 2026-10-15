import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type ScanModule0 = typeof import('@/lib/server/neon-db');
type ScanModule1 = typeof import('@/lib/security-audit');
type ScanModule2 = typeof import('@/lib/services/organization-policy-gate');

const mocks = vi.hoisted(() => ({
  resolvePolicy: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
}));

vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getNeonDb: vi.fn(() => ({})),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  resolveSecretHandlingPolicy: mocks.resolvePolicy,
}));

const { applySecretHandlingToRequest } = await import('./secret-handling-gate');
const { applySecretHandlingToTurnTexts } = await import('./secret-handling-turn-gate');

const STRIPE_KEY = `sk_live_${'a'.repeat(30)}`;
const LOW_CONFIDENCE_JWT = `eyJ${'a'.repeat(24)}.${'b'.repeat(24)}`;
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function processedWith(messages: Array<Record<string, unknown>>) {
  return { llmRequest: { messages } } as unknown as Parameters<
    typeof applySecretHandlingToRequest
  >[2];
}

const request = new NextRequest('https://agiworkforce.com/api/models/free-quota/completions');

describe('applySecretHandlingToTurnTexts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records nothing and never reads the policy for a turn with no secret', async () => {
    const outcome = await applySecretHandlingToTurnTexts('user-1', request, ['hello there', '']);

    expect(outcome).toEqual({ action: 'clean', texts: ['hello there', ''], matchCount: 0 });
    expect(mocks.resolvePolicy).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('records the same event the request path records, never the secret value', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'redact', organizationId: ORGANIZATION_ID });
    const processed = processedWith([{ role: 'user', content: `key: ${STRIPE_KEY}` }]);
    await applySecretHandlingToRequest('user-1', request, processed);
    const requestPathEvent = mocks.recordAuditEvent.mock.calls[0]![0];
    mocks.recordAuditEvent.mockClear();

    const outcome = await applySecretHandlingToTurnTexts('user-1', request, [`key: ${STRIPE_KEY}`]);

    expect(outcome.action).toBe('redacted');
    expect(outcome.matchCount).toBe(1);
    expect(outcome.texts[0]).not.toContain(STRIPE_KEY);
    expect(outcome.texts[0]).toContain('[REDACTED]');
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuditEvent.mock.calls[0]![0]).toEqual(requestPathEvent);
    expect(JSON.stringify(mocks.recordAuditEvent.mock.calls[0]![0])).not.toContain(STRIPE_KEY);
  });

  it('records a blocked turn as denied and returns the texts untouched', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'block', organizationId: null });

    const outcome = await applySecretHandlingToTurnTexts('user-1', request, [
      'first message',
      `key: ${STRIPE_KEY}`,
    ]);

    expect(outcome.action).toBe('blocked');
    expect(outcome.texts[1]).toContain(STRIPE_KEY);
    const event = mocks.recordAuditEvent.mock.calls[0]![0] as {
      eventType: string;
      outcome: string;
      severity: string;
      detail: Record<string, unknown>;
    };
    expect(event).toMatchObject({
      eventType: 'secret_detected',
      outcome: 'denied',
      severity: 'warning',
      detail: { resourceType: 'chat_completion', status: 'blocked', count: 1 },
    });
  });

  it('records a low-confidence match as a warning and changes nothing', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'block', organizationId: null });

    const outcome = await applySecretHandlingToTurnTexts('user-1', request, [
      `token: ${LOW_CONFIDENCE_JWT}`,
    ]);

    expect(outcome).toEqual({
      action: 'warned',
      texts: [`token: ${LOW_CONFIDENCE_JWT}`],
      matchCount: 1,
    });
    expect(mocks.recordAuditEvent.mock.calls[0]![0]).toMatchObject({
      eventType: 'secret_detected',
      outcome: 'success',
      detail: { source: 'JWT', status: 'warned', count: 1 },
    });
  });
});

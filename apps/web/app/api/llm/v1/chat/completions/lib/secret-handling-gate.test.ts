import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  resolvePolicy: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  resolveSecretHandlingPolicy: mocks.resolvePolicy,
}));
vi.mock('@/lib/security/secrets-audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/secrets-audit')>();
  return {
    ...actual,
    scanForSecrets: vi.fn(actual.scanForSecrets),
    redactSecrets: vi.fn(actual.redactSecrets),
  };
});

const { applySecretHandlingToRequest, buildSecretRedactionNotice } =
  await import('./secret-handling-gate');
const secretsAudit = await import('@/lib/security/secrets-audit');

const STRIPE_KEY = `sk_live_${'a'.repeat(30)}`;
const LOW_CONFIDENCE_JWT = `eyJ${'a'.repeat(24)}.${'b'.repeat(24)}`;
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

function processedWith(messages: Array<Record<string, unknown>>) {
  return { llmRequest: { messages } } as unknown as Parameters<
    typeof applySecretHandlingToRequest
  >[2];
}

const request = new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions');

describe('applySecretHandlingToRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports clean and never reads the policy when no message carries a secret', async () => {
    const processed = processedWith([{ role: 'user', content: 'hello there' }]);

    const outcome = await applySecretHandlingToRequest('user-1', request, processed);

    expect(outcome).toEqual({ action: 'clean', patternNames: [], matchCount: 0, notice: null });
    expect(mocks.resolvePolicy).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('warn mode leaves the message content untouched', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'warn', organizationId: null });
    const processed = processedWith([{ role: 'user', content: `key: ${STRIPE_KEY}` }]);

    const outcome = await applySecretHandlingToRequest('user-1', request, processed);

    expect(outcome.action).toBe('warned');
    expect(outcome.notice).toBeNull();
    expect(processed.llmRequest.messages[0]!.content).toContain(STRIPE_KEY);
  });

  it('redact mode replaces the matched span, leaves other messages alone, and returns a notice', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'redact', organizationId: ORGANIZATION_ID });
    const processed = processedWith([
      { role: 'user', content: `key: ${STRIPE_KEY}` },
      { role: 'assistant', content: 'no secret here' },
    ]);

    const outcome = await applySecretHandlingToRequest('user-1', request, processed);

    expect(outcome.action).toBe('redacted');
    expect(outcome.notice).toBe(buildSecretRedactionNotice(1));
    expect(processed.llmRequest.messages[0]!.content).not.toContain(STRIPE_KEY);
    expect(processed.llmRequest.messages[0]!.content).toContain('[REDACTED]');
    expect(processed.llmRequest.messages[1]!.content).toBe('no secret here');
  });

  it('block mode leaves the message untouched and reports blocked', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'block', organizationId: ORGANIZATION_ID });
    const processed = processedWith([{ role: 'user', content: `key: ${STRIPE_KEY}` }]);

    const outcome = await applySecretHandlingToRequest('user-1', request, processed);

    expect(outcome.action).toBe('blocked');
    expect(processed.llmRequest.messages[0]!.content).toContain(STRIPE_KEY);
  });

  it.each(['warn', 'redact', 'block'] as const)(
    'treats a low-confidence-only match as a warning under %s mode, never blocking or redacting',
    async (mode) => {
      mocks.resolvePolicy.mockResolvedValue({ mode, organizationId: ORGANIZATION_ID });
      const processed = processedWith([{ role: 'user', content: `token: ${LOW_CONFIDENCE_JWT}` }]);

      const outcome = await applySecretHandlingToRequest('user-1', request, processed);

      expect(outcome.action).toBe('warned');
      expect(outcome.notice).toBeNull();
      expect(outcome.patternNames).toEqual(['JWT']);
      expect(processed.llmRequest.messages[0]!.content).toContain(LOW_CONFIDENCE_JWT);
    },
  );

  it('redacts only the high-confidence span when a message carries both tiers', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'redact', organizationId: ORGANIZATION_ID });
    const processed = processedWith([
      { role: 'user', content: `key: ${STRIPE_KEY} token: ${LOW_CONFIDENCE_JWT}` },
    ]);

    const outcome = await applySecretHandlingToRequest('user-1', request, processed);

    expect(outcome.action).toBe('redacted');
    expect(outcome.patternNames).toEqual(['Stripe Live Key']);
    expect(processed.llmRequest.messages[0]!.content).not.toContain(STRIPE_KEY);
    expect(processed.llmRequest.messages[0]!.content).toContain(LOW_CONFIDENCE_JWT);
  });

  it('records an audit event carrying the pattern name and count, never the secret value', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'redact', organizationId: ORGANIZATION_ID });
    const processed = processedWith([{ role: 'user', content: `key: ${STRIPE_KEY}` }]);

    await applySecretHandlingToRequest('user-1', request, processed);

    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
    const event = mocks.recordAuditEvent.mock.calls[0]![0] as {
      eventType: string;
      organizationId: string | null;
      detail: Record<string, unknown>;
    };
    expect(event.eventType).toBe('secret_detected');
    expect(event.organizationId).toBe(ORGANIZATION_ID);
    expect(event.detail['status']).toBe('redacted');
    expect(event.detail['source']).toBe('Stripe Live Key');
    expect(event.detail['count']).toBe(1);
    expect(JSON.stringify(event)).not.toContain(STRIPE_KEY);
  });

  it('scans the whole request once regardless of message count', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'redact', organizationId: null });
    const messages = Array.from({ length: 30 }, (_, index) => ({
      role: 'user' as const,
      content: `message number ${index}`,
    }));
    messages.push({ role: 'user', content: `key: ${STRIPE_KEY}` });
    const processed = processedWith(messages);

    await applySecretHandlingToRequest('user-1', request, processed);

    expect(secretsAudit.scanForSecrets).toHaveBeenCalledTimes(1);
    expect(secretsAudit.redactSecrets).toHaveBeenCalledTimes(1);
  });
});

describe('buildSecretRedactionNotice', () => {
  it('pluralizes for counts other than one', () => {
    expect(buildSecretRedactionNotice(1)).toBe(
      '1 secret was removed from this message before it was sent.',
    );
    expect(buildSecretRedactionNotice(2)).toBe(
      '2 secrets were removed from this message before it was sent.',
    );
  });
});

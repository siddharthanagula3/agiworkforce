import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  resolvePolicy: vi.fn(),
  recordAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({})) }));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  resolveSecretHandlingPolicy: mocks.resolvePolicy,
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));

import { NextRequest } from 'next/server';
import { applySecretHandlingToRequest } from '@/app/api/llm/v1/chat/completions/lib/secret-handling-gate';
import {
  redactSecretsFromValue,
  SecretRedactionIncompleteError,
} from '@/lib/security/secrets-audit';

/**
 * The delimiter the scanner used to join messages with is uppercase letters and
 * hyphens, which is exactly the character class several patterns match. A
 * redaction that swallowed the delimiter made the split return fewer pieces
 * than there were messages, and every message past that point fell back to
 * `span.text`: the caller's own unredacted words, while the turn was reported
 * as redacted and the user was told the secret had been removed.
 */
const SCAN_BOUNDARY = ' AGI-CHAT-SECRET-SCAN-BOUNDARY ';
const STRIPE_KEY = `sk_live_${'a'.repeat(24)}`;

function request(): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
    method: 'POST',
  });
}

type TestProcessed = { llmRequest: { messages: Array<{ role: string; content: string }> } };

function processed(contents: string[]): TestProcessed {
  return {
    llmRequest: { messages: contents.map((content) => ({ role: 'user', content })) },
  };
}

type GateInput = Parameters<typeof applySecretHandlingToRequest>[2];

function gate(userId: string, target: TestProcessed) {
  return applySecretHandlingToRequest(userId, request(), target as unknown as GateInput);
}

describe('a message the gate reports as redacted never carries the secret onward', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePolicy.mockResolvedValue({ mode: 'redact', organizationId: 'org-1' });
  });

  it('redacts every message, not only the ones before a swallowed delimiter', async () => {
    const target = processed([`here is ${STRIPE_KEY}`, `and again ${STRIPE_KEY}`]);

    const outcome = await gate('user-1', target);

    expect(outcome.action).toBe('redacted');
    for (const message of target.llmRequest.messages) {
      expect(message.content).not.toContain(STRIPE_KEY);
    }
  });

  it('redacts a secret positioned to run into the scan boundary', async () => {
    const target = processed([
      `trailing ${STRIPE_KEY}${SCAN_BOUNDARY.trimEnd()}`,
      'second message',
    ]);

    const outcome = await gate('user-1', target);

    expect(outcome.action).toBe('redacted');
    expect(target.llmRequest.messages[0]!.content).not.toContain(STRIPE_KEY);
    expect(
      target.llmRequest.messages[1]!.content,
      'a later message must survive intact, not be dropped by a shifted split',
    ).toBe('second message');
  });

  it('leaves a clean request untouched', async () => {
    const target = processed(['nothing to see', 'still nothing']);

    const outcome = await gate('user-1', target);

    expect(outcome.action).toBe('clean');
    expect(target.llmRequest.messages[0]!.content).toBe('nothing to see');
  });

  it('blocks rather than redacts when the workspace policy says block', async () => {
    mocks.resolvePolicy.mockResolvedValue({ mode: 'block', organizationId: 'org-1' });
    const target = processed([`here is ${STRIPE_KEY}`]);

    const outcome = await gate('user-1', target);

    expect(outcome.action).toBe('blocked');
  });
});

describe('a value the redactor returns has been checked, not assumed', () => {
  it('redacts every string independently', () => {
    const { value } = redactSecretsFromValue({
      first: `key ${STRIPE_KEY}`,
      nested: { second: `key ${STRIPE_KEY}` },
    });

    expect(JSON.stringify(value)).not.toContain(STRIPE_KEY);
  });

  it('refuses rather than returning a value it could not fully redact', () => {
    const scan = vi.spyOn(String.prototype, 'replace');
    scan.mockImplementation(function (this: string) {
      return this;
    });

    try {
      expect(() => redactSecretsFromValue({ leak: `key ${STRIPE_KEY}` })).toThrow(
        SecretRedactionIncompleteError,
      );
    } finally {
      scan.mockRestore();
    }
  });

  it('leaves a clean value alone', () => {
    const input = { note: 'nothing to see' };

    const { value, detections } = redactSecretsFromValue(input);

    expect(detections).toHaveLength(0);
    expect(value).toBe(input);
  });
});

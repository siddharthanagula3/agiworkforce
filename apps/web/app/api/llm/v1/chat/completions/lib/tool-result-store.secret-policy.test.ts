import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryKeyValueStore, type KeyValueStore } from '@agiworkforce/key-value';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  store: null as KeyValueStore | null,
  resolvePolicy: vi.fn(),
  audit: vi.fn(async () => undefined),
}));
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueProvider: vi.fn(),
  getKeyValueRateLimiter: vi.fn(),
  getKeyValueStore: () => mocks.store,
}));
vi.mock('@/lib/server/neon-db', async () => ({
  ...(await vi.importActual<typeof import('@/lib/server/neon-db')>('@/lib/server/neon-db')),
  getNeonDb: vi.fn(() => ({})),
}));
vi.mock('@/lib/security-audit', async () => ({
  ...(await vi.importActual<typeof import('@/lib/security-audit')>('@/lib/security-audit')),

  recordAuditEvent: mocks.audit,
  BLOCK_APPEAL_PATH: '/support',
}));
vi.mock('@/lib/services/organization-policy-gate', async () => ({
  ...(await vi.importActual<OrganizationPolicyGateModule>(
    '@/lib/services/organization-policy-gate',
  )),

  evaluateActiveWorkspacePolicy: vi.fn(async () => ({ allowed: true, organizationId: null })),
  evaluateWorkspacePolicyFor: vi.fn(async () => ({ allowed: true, organizationId: null })),
  resolveEffectiveWorkspaceControls: vi.fn(async () => null),
  resolveSecretHandlingPolicy: mocks.resolvePolicy,
  resolveZeroDataRetentionPolicy: async () => ({ required: false, organizationId: null }),
}));

import { MAX_EXECUTION_OUTPUT_BYTES } from '@/lib/e2b/types';
import { redactAuditedSecrets, scanForSecrets } from '@/lib/security/secrets-audit';
import { isHighConfidenceSecretName } from '@/lib/security/secret-patterns';
import {
  keepTrimmedToolResult,
  listConversationToolResults,
  readStoredToolResult,
  referenceOversizedToolResult,
} from './tool-result-store';

type OrganizationPolicyGateModule = typeof import('@/lib/services/organization-policy-gate');

const OWNER = { userId: 'secret-policy-fixture-user', conversationId: 'fixture-conversation' };
const TOKEN = `ghp_${'a'.repeat(36)}`;
const PREFIX = MAX_EXECUTION_OUTPUT_BYTES - TOKEN.length / 2;
const BODY = `${'x'.repeat(PREFIX)}${TOKEN}${'y'.repeat(20_000)}`;

function mode(value: 'warn' | 'redact' | 'block'): void {
  mocks.resolvePolicy.mockResolvedValue({ mode: value, organizationId: null });
}

async function retain(content = BODY) {
  return referenceOversizedToolResult({
    ...OWNER,
    toolCallId: 'call',
    toolName: 'read_file',
    content,
  });
}

function referenceOf(result: Awaited<ReturnType<typeof retain>>): string {
  const reference = result?.content.match(/with reference "([A-Za-z0-9_-]+)"/)?.[1];
  if (!reference) throw new Error('Expected a retained fixture reference');
  return reference;
}

beforeEach(() => {
  mocks.store = createMemoryKeyValueStore();
  mocks.resolvePolicy.mockReset();
  mocks.audit.mockClear();
});

describe('complete retained-result secret policy', () => {
  it('qualifies a whole-value detection that neither inline fragment recognizes', () => {
    expect(scanForSecrets(BODY).some((hit) => isHighConfidenceSecretName(hit.name))).toBe(true);
    expect(scanForSecrets(BODY.slice(0, MAX_EXECUTION_OUTPUT_BYTES))).toEqual([]);
    expect(scanForSecrets(BODY.slice(MAX_EXECUTION_OUTPUT_BYTES))).toEqual([]);
  });

  it('blocks before storing or advertising any part of a split secret', async () => {
    mode('block');
    const result = await retain();
    expect(result?.content.includes('blocked')).toBe(true);
    expect(result?.content.includes(TOKEN.slice(0, 20))).toBe(false);
    expect(result?.content.includes('with reference')).toBe(false);
    expect(await listConversationToolResults(OWNER)).toEqual([]);
  });

  it('redacts before the inline cutoff and defines retained offsets against approved text', async () => {
    mode('redact');
    const result = await retain();
    expect(result?.content.includes(TOKEN.slice(0, 20))).toBe(false);
    const reference = referenceOf(result);
    const approved = redactAuditedSecrets(BODY);
    const stored = await mocks.store!.get<{ content: string; totalChars: number }>(
      `agi-tool-result:${OWNER.userId}:${OWNER.conversationId}:${reference}`,
    );
    expect(stored?.content === approved).toBe(true);
    expect(stored?.totalChars).toBe(approved.length);
    const page = await readStoredToolResult(OWNER, { reference, offset: PREFIX });
    expect(page.isError).toBe(false);
    expect(page.content.includes('[REDACTED]')).toBe(true);
    expect(page.content.includes(TOKEN.slice(20))).toBe(false);
    expect(page.content).toContain(`of ${approved.length}.`);
  });

  it('preserves permitted warn-mode content and owner fencing', async () => {
    mode('warn');
    const reference = referenceOf(await retain());
    const page = await readStoredToolResult(OWNER, { reference, offset: PREFIX });
    expect(page.isError).toBe(false);
    expect(page.content.includes(TOKEN)).toBe(true);
    expect(
      (
        await readStoredToolResult(
          { ...OWNER, userId: 'other-user' },
          { reference, offset: PREFIX },
        )
      ).isError,
    ).toBe(true);
  });

  it('applies a newly strict policy to a complete earlier warn-mode result before paging', async () => {
    mode('warn');
    const reference = referenceOf(await retain());
    mode('block');
    const page = await readStoredToolResult(OWNER, {
      reference,
      offset: MAX_EXECUTION_OUTPUT_BYTES,
    });
    expect(page.isError).toBe(true);
    expect(page.content.includes(TOKEN.slice(20))).toBe(false);
    expect(page.content.includes('blocked')).toBe(true);
  });

  it('redacts an earlier warn-mode result even when the requested page starts inside the match', async () => {
    mode('warn');
    const reference = referenceOf(await retain());
    mode('redact');
    const page = await readStoredToolResult(OWNER, {
      reference,
      offset: MAX_EXECUTION_OUTPUT_BYTES,
    });
    expect(page.isError).toBe(false);
    expect(page.content.includes(TOKEN.slice(20))).toBe(false);
    expect(page.content).toContain(`of ${redactAuditedSecrets(BODY).length}.`);
  });

  it.each(['redact', 'block'] as const)(
    'never falls back to unpoliced bytes when storage is absent in %s mode',
    async (value) => {
      mode(value);
      mocks.store = null;
      const result = await retain();
      expect(result).not.toBeNull();
      expect(result?.content.includes(TOKEN.slice(0, 20))).toBe(false);
      expect(result?.content.includes('with reference')).toBe(false);
    },
  );

  it('refuses retention of a blocked trimmed result', async () => {
    mode('block');
    expect(
      await keepTrimmedToolResult({
        ...OWNER,
        toolCallId: 'call',
        reference: 'trimmed',
        toolName: 'read_file',
        content: BODY,
      }),
    ).toBe(false);
    expect(await listConversationToolResults(OWNER)).toEqual([]);
  });

  it('keeps approved content when redaction makes the result fit inline', async () => {
    mode('redact');
    const content = `${'x'.repeat(PREFIX)}${TOKEN}`;
    const result = await retain(content);
    expect(result?.content === redactAuditedSecrets(content)).toBe(true);
    expect(result?.reference).toBeUndefined();
    expect(await listConversationToolResults(OWNER)).toEqual([]);
  });

  it('keeps the approved fallback when the storage write throws', async () => {
    mode('redact');
    vi.spyOn(mocks.store!, 'set').mockRejectedValueOnce(new Error('fixture cache unavailable'));
    const result = await retain();
    expect(result).not.toBeNull();
    expect(result?.content.includes(TOKEN.slice(0, 20))).toBe(false);
    expect(result?.reference).toBeUndefined();
    expect(result?.content.includes('output truncated')).toBe(true);
  });

  it('polices another high-confidence format before a page can begin inside it', async () => {
    const token = `sk_live_${'a'.repeat(30)}`;
    const content = `${'x'.repeat(PREFIX)}${token}${'y'.repeat(20_000)}`;
    expect(scanForSecrets(content).some((hit) => isHighConfidenceSecretName(hit.name))).toBe(true);
    mode('warn');
    const reference = referenceOf(await retain(content));
    mode('block');
    const page = await readStoredToolResult(OWNER, { reference, offset: PREFIX + 20 });
    expect(page.isError).toBe(true);
    expect(page.content.includes(token.slice(20))).toBe(false);
  });

  it('retains only the approved trimmed representation', async () => {
    mode('redact');
    expect(
      await keepTrimmedToolResult({
        ...OWNER,
        toolCallId: 'call',
        reference: 'trimmed',
        toolName: 'read_file',
        content: BODY,
      }),
    ).toBe(true);
    const stored = await mocks.store!.get<{ content: string }>(
      `agi-tool-result:${OWNER.userId}:${OWNER.conversationId}:trimmed`,
    );
    expect(stored?.content === redactAuditedSecrets(BODY)).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryKeyValueStore, type KeyValueStore } from '@agiworkforce/key-value';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  PINO_LEVELS: vi.fn(),
  loggerOptions: vi.fn(),
  resolveLogLevel: vi.fn(),
  shouldUsePrettyLogTransport: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const store = vi.hoisted(() => ({ value: null as KeyValueStore | null }));
vi.mock('@/lib/server/key-value', () => ({
  getKeyValueProvider: vi.fn(),
  getKeyValueRateLimiter: vi.fn(),
  getKeyValueStore: () => store.value,
}));

import { MAX_EXECUTION_OUTPUT_BYTES } from '@/lib/e2b/types';
import { trimToolResultHistoryKeepingReferences } from './tool-loop';
import { ChatCompletionRequestSchema } from './request-processor';
import {
  keepTrimmedToolResult,
  listConversationToolResults,
  readStoredToolResult,
  referenceOversizedToolResult,
  toolResultOwnerForTurn,
  trimmedToolResultNotice,
  type ReferencedToolResult,
} from './tool-result-store';

const USER_ID = 'user-1';
const CONVERSATION_ID = 'conversation-1';
const OWNER = { userId: USER_ID, conversationId: CONVERSATION_ID };

function advertisedReference(notice: string | ReferencedToolResult | null): string {
  const text = typeof notice === 'string' ? notice : notice?.content;
  const reference = text?.match(/read_tool_result with reference "([A-Za-z0-9_-]+)"/)?.[1];
  if (!reference) throw new Error('A successful retention notice must name its reference');
  if (notice && typeof notice !== 'string') expect(notice.reference).toBe(reference);
  return reference;
}

beforeEach(() => {
  store.value = createMemoryKeyValueStore();
});

describe('trimmed tool results', () => {
  it('never replaces an existing retained generation if a reference is accidentally reused', async () => {
    const reference = 'owned-immutable-reference';
    expect(
      await keepTrimmedToolResult({
        ...OWNER,
        reference,
        toolCallId: 'call-a',
        content: 'ORIGINAL_A',
      }),
    ).toBe(true);
    expect(
      await keepTrimmedToolResult({
        ...OWNER,
        reference,
        toolCallId: 'call-b',
        content: 'LATER_B',
      }),
    ).toBe(false);
    const result = await readStoredToolResult(OWNER, { reference, offset: 0 });
    expect(result.content).toContain('ORIGINAL_A');
    expect(result.content).not.toContain('LATER_B');
  });

  it('refuses an unverifiable legacy generation rather than returning potentially aliased bytes', async () => {
    if (!store.value) throw new Error('Store fixture missing');
    await store.value.set(`agi-tool-result:${USER_ID}:${CONVERSATION_ID}:legacy-call`, {
      content: 'LEGACY_VALUE',
      totalChars: 12,
    });
    await store.value.hashSet(`agi-tool-result-index:${USER_ID}:${CONVERSATION_ID}`, {
      'legacy-call': JSON.stringify({ totalChars: 12, storedAt: Date.now() }),
    });
    const result = await readStoredToolResult(OWNER, { reference: 'legacy-call', offset: 0 });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('cannot be verified');
    expect(result.content).not.toContain('LEGACY_VALUE');
    expect(await listConversationToolResults(OWNER)).toEqual([]);
    expect(
      await store.value.get(`agi-tool-result:${USER_ID}:${CONVERSATION_ID}:legacy-call`),
    ).toMatchObject({ content: 'LEGACY_VALUE' });
  });

  it('does not accept a caller-supplied internal retention pointer', () => {
    const parsed = ChatCompletionRequestSchema.parse({
      model: 'auto',
      messages: [
        {
          role: 'user',
          content: 'hello',
          __retainedToolResultReference: '0190a000-0000-4000-8000-000000000009',
        },
      ],
    });
    expect(parsed.messages[0]).not.toHaveProperty('__retainedToolResultReference');
  });
  it('keeps a trimmed result readable through its reference', async () => {
    const content = 'row\n'.repeat(5_000);
    expect(trimmedToolResultNotice('call_1')).toContain('read_tool_result with reference "call_1"');
    await expect(
      keepTrimmedToolResult({ ...OWNER, reference: 'call_1', toolCallId: 'call_1', content }),
    ).resolves.toBe(true);
    const read = await readStoredToolResult(OWNER, { reference: 'call_1', offset: 0 });
    expect(read.isError).toBe(false);
    expect(read.content).toContain('row\nrow');
    expect(read.content).toContain(`of ${content.length}.`);
  });

  it('leaves the full result an oversized notice already points to', async () => {
    const full = 'x'.repeat(MAX_EXECUTION_OUTPUT_BYTES + 10);
    const inline = await referenceOversizedToolResult({
      ...OWNER,
      toolCallId: 'call_2',
      toolName: 'connector__export',
      content: full,
    });
    expect(inline).not.toBeNull();
    if (!inline) throw new Error('The fixture must be retained');
    const messages = [
      {
        role: 'tool',
        tool_call_id: 'call_2',
        content: inline.content,
        __retainedToolResultReference: inline.reference,
      },
      { role: 'tool', content: 'recent' },
    ];
    await trimToolResultHistoryKeepingReferences(messages, OWNER, 100, 1);
    expect(messages[0]!.content).toBe(trimmedToolResultNotice(inline.reference));
    const read = await readStoredToolResult(OWNER, { reference: inline.reference, offset: 0 });
    expect(read.content).toContain(`of ${full.length}.`);
  });

  it('keeps nothing without a store or a user', async () => {
    await expect(
      keepTrimmedToolResult({
        userId: undefined,
        conversationId: CONVERSATION_ID,
        toolCallId: 'call_3',
        reference: 'call_3',
        content: 'data',
      }),
    ).resolves.toBe(false);
    store.value = null;
    await expect(
      keepTrimmedToolResult({
        ...OWNER,
        reference: 'call_3',
        toolCallId: 'call_3',
        content: 'data',
      }),
    ).resolves.toBe(false);
  });

  it('keeps a turn without a conversation readable within that turn alone', async () => {
    const turn = toolResultOwnerForTurn({
      userId: USER_ID,
      conversationId: undefined,
      requestId: 'request-1',
    });
    const content = 'row\n'.repeat(5_000);
    await expect(
      keepTrimmedToolResult({ ...turn, reference: 'call_7', toolCallId: 'call_7', content }),
    ).resolves.toBe(true);

    expect((await readStoredToolResult(turn, { reference: 'call_7', offset: 0 })).isError).toBe(
      false,
    );
    for (const other of [
      { userId: USER_ID, conversationId: undefined, requestId: 'request-2' },
      { userId: USER_ID, conversationId: CONVERSATION_ID, requestId: 'request-1' },
    ]) {
      const read = await readStoredToolResult(toolResultOwnerForTurn(other), {
        reference: 'call_7',
        offset: 0,
      });
      expect(read.isError).toBe(true);
    }
  });

  it('keeps nothing without a conversation to scope it to', async () => {
    await expect(
      keepTrimmedToolResult({
        userId: USER_ID,
        reference: 'call_6',
        toolCallId: 'call_6',
        content: 'data',
      }),
    ).resolves.toBe(false);
    await expect(
      referenceOversizedToolResult({
        userId: USER_ID,
        conversationId: null,
        toolCallId: 'call_6',
        toolName: 'connector__export',
        content: 'x'.repeat(MAX_EXECUTION_OUTPUT_BYTES + 10),
      }),
    ).resolves.toBeNull();
  });

  it('does not return a result stored by another conversation under the same tool call id', async () => {
    await keepTrimmedToolResult({
      ...OWNER,
      toolCallId: 'gemini-tool-1',
      reference: 'gemini-tool-1',
      content: 'from the first conversation',
    });
    await keepTrimmedToolResult({
      userId: USER_ID,
      conversationId: 'conversation-2',
      toolCallId: 'gemini-tool-1',
      reference: 'gemini-tool-1',
      content: 'from the second conversation',
    });

    const first = await readStoredToolResult(OWNER, { reference: 'gemini-tool-1', offset: 0 });
    const second = await readStoredToolResult(
      { userId: USER_ID, conversationId: 'conversation-2' },
      { reference: 'gemini-tool-1', offset: 0 },
    );
    const unscoped = await readStoredToolResult(
      { userId: USER_ID },
      { reference: 'gemini-tool-1', offset: 0 },
    );
    const otherConversation = await readStoredToolResult(
      { userId: USER_ID, conversationId: 'conversation-3' },
      { reference: 'gemini-tool-1', offset: 0 },
    );

    expect(first.content).toContain('from the first conversation');
    expect(first.content).not.toContain('from the second conversation');
    expect(second.content).toContain('from the second conversation');
    expect(unscoped.isError).toBe(true);
    expect(otherConversation.isError).toBe(true);
  });

  it('reads a kept result back only for the user who produced it', async () => {
    await keepTrimmedToolResult({
      ...OWNER,
      reference: 'call_4',
      toolCallId: 'call_4',
      content: 'private',
    });
    const read = await readStoredToolResult(
      { ...OWNER, userId: 'user-2' },
      { reference: 'call_4', offset: 0 },
    );
    expect(read.isError).toBe(true);
  });
});

describe('oversized results handed over as a prefix', () => {
  it('does not revive an expired reference when a later call reuses the provider id', async () => {
    let now = Date.now();
    store.value = createMemoryKeyValueStore({ now: () => now });
    const first = advertisedReference(
      await referenceOversizedToolResult({
        ...OWNER,
        toolCallId: 'repeated',
        toolName: 'execute_code',
        content: 'a'.repeat(MAX_EXECUTION_OUTPUT_BYTES + 10),
      }),
    );
    now += 25 * 60 * 60 * 1000;
    expect((await readStoredToolResult(OWNER, { reference: first, offset: 0 })).isError).toBe(true);
    const second = advertisedReference(
      await referenceOversizedToolResult({
        ...OWNER,
        toolCallId: 'repeated',
        toolName: 'execute_code',
        content: 'b'.repeat(MAX_EXECUTION_OUTPUT_BYTES + 10),
      }),
    );
    expect(first).not.toBe(second);
    expect((await readStoredToolResult(OWNER, { reference: first, offset: 0 })).isError).toBe(true);
    expect((await readStoredToolResult(OWNER, { reference: second, offset: 0 })).content).toContain(
      'bbbb',
    );
  });
  it('keeps separate results readable when a later response reuses a provider call id', async () => {
    const firstContent = 'a'.repeat(MAX_EXECUTION_OUTPUT_BYTES + 64) + 'ORIGINAL_RESULT_A';
    const secondContent = 'b'.repeat(MAX_EXECUTION_OUTPUT_BYTES + 64) + 'LATER_RESULT_B';
    const first = advertisedReference(
      await referenceOversizedToolResult({
        ...OWNER,
        toolCallId: 'gemini-tool-1',
        toolName: 'execute_code',
        content: firstContent,
      }),
    );
    const second = advertisedReference(
      await referenceOversizedToolResult({
        ...OWNER,
        toolCallId: 'gemini-tool-1',
        toolName: 'execute_code',
        content: secondContent,
      }),
    );
    const earlier = await readStoredToolResult(OWNER, {
      reference: first,
      offset: MAX_EXECUTION_OUTPUT_BYTES,
    });
    expect(earlier.isError).toBe(false);
    expect(earlier.content).toContain('ORIGINAL_RESULT_A');
    expect(earlier.content).not.toContain('LATER_RESULT_B');
    expect(
      (await readStoredToolResult(OWNER, { reference: second, offset: MAX_EXECUTION_OUTPUT_BYTES }))
        .content,
    ).toContain('LATER_RESULT_B');
    expect(first).not.toBe(second);
    expect((await listConversationToolResults(OWNER)).map((row) => row.reference)).toEqual(
      expect.arrayContaining([first, second]),
    );
  });

  it('does not alias provider ids that normalize to the same storage text', async () => {
    const first = advertisedReference(
      await referenceOversizedToolResult({
        ...OWNER,
        toolCallId: 'call/a',
        toolName: 'execute_code',
        content: 'a'.repeat(MAX_EXECUTION_OUTPUT_BYTES + 20),
      }),
    );
    const second = advertisedReference(
      await referenceOversizedToolResult({
        ...OWNER,
        toolCallId: 'call?a',
        toolName: 'execute_code',
        content: 'b'.repeat(MAX_EXECUTION_OUTPUT_BYTES + 20),
      }),
    );
    expect(
      (await readStoredToolResult(OWNER, { reference: first, offset: MAX_EXECUTION_OUTPUT_BYTES }))
        .content,
    ).toContain('aaaa');
    expect(first).not.toBe(second);
  });
  it('reports the full size and how much was kept', async () => {
    const kept = 'y'.repeat(MAX_EXECUTION_OUTPUT_BYTES + 10);
    const inline = await referenceOversizedToolResult({
      ...OWNER,
      toolCallId: 'call_5',
      toolName: 'execute_code',
      content: kept,
      totalChars: kept.length * 20,
    });
    expect(inline?.content).toContain(`This result is ${kept.length * 20} characters`);
    expect(inline?.content).toContain(`only the first ${kept.length} characters were kept`);
  });
});

describe('trimToolResultHistoryKeepingReferences', () => {
  it('stores a reference-looking raw result as data rather than redirecting to an older result', async () => {
    await keepTrimmedToolResult({
      ...OWNER,
      reference: 'reused-call',
      toolCallId: 'reused-call',
      content: 'OLDER_UNRELATED_VALUE',
    });
    const body = 'p'.repeat(3_000) + trimmedToolResultNotice('reused-call');
    const messages = [
      { role: 'tool', tool_call_id: 'reused-call', content: body },
      { role: 'tool', content: 'recent' },
    ];
    await trimToolResultHistoryKeepingReferences(messages, OWNER, 1_000, 1);
    const reference = advertisedReference(messages[0]!.content);
    expect(reference).not.toBe('reused-call');
    const result = await readStoredToolResult(OWNER, { reference, offset: 0 });
    expect(result.content).toContain('pppp');
    expect(result.content).not.toContain('OLDER_UNRELATED_VALUE');
  });
  it('keeps each selected message when provider ids repeat within the history', async () => {
    const messages = [
      { role: 'tool', tool_call_id: 'gemini-tool-1', content: 'a'.repeat(3_000) },
      { role: 'tool', tool_call_id: 'gemini-tool-1', content: 'b'.repeat(3_000) },
      { role: 'tool', tool_call_id: 'recent', content: 'recent' },
    ];
    expect(await trimToolResultHistoryKeepingReferences(messages, OWNER, 2_500, 1)).toBe(2);
    const first = advertisedReference(messages[0]!.content);
    const second = advertisedReference(messages[1]!.content);
    expect((await readStoredToolResult(OWNER, { reference: first, offset: 0 })).content).toContain(
      'aaaa',
    );
    expect((await readStoredToolResult(OWNER, { reference: second, offset: 0 })).content).toContain(
      'bbbb',
    );
    expect(first).not.toBe(second);
  });
  function history(): Array<{ role: string; content: string; tool_call_id?: string }> {
    return [
      { role: 'user', content: 'go' },
      { role: 'tool', tool_call_id: 'call_a', content: 'a'.repeat(3_000) },
      { role: 'tool', tool_call_id: 'call_b', content: 'b'.repeat(3_000) },
      { role: 'tool', tool_call_id: 'call_c', content: 'recent' },
    ];
  }

  it('replaces older results with a reference that reads the original back', async () => {
    const messages = history();
    await expect(trimToolResultHistoryKeepingReferences(messages, OWNER, 2_500, 1)).resolves.toBe(
      2,
    );
    const reference = advertisedReference(String(messages[1]!.content));
    expect(messages[1]!.content).toBe(trimmedToolResultNotice(reference));
    expect(messages[3]!.content).toBe('recent');
    const read = await readStoredToolResult(OWNER, { reference, offset: 0 });
    expect(read.content).toContain('aaaa');
    expect(read.content).toContain('of 3000.');
  });

  it('does not trim a reference notice again', async () => {
    const messages = history();
    await trimToolResultHistoryKeepingReferences(messages, OWNER, 100, 1);
    const once = messages.map((message) => message.content);
    await expect(trimToolResultHistoryKeepingReferences(messages, OWNER, 100, 1)).resolves.toBe(0);
    expect(messages.map((message) => message.content)).toEqual(once);
  });

  it('falls back to the plain marker when nothing can be kept', async () => {
    const messages = history();
    await trimToolResultHistoryKeepingReferences(messages, { userId: undefined }, 2_500, 1);
    expect(messages[1]!.content).toMatch(/^\[earlier tool result omitted/);
  });
});

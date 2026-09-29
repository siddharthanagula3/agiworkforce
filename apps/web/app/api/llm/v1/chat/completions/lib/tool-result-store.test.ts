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
import {
  keepTrimmedToolResult,
  readStoredToolResult,
  referenceOversizedToolResult,
  trimmedToolResultNotice,
} from './tool-result-store';

const USER_ID = 'user-1';

beforeEach(() => {
  store.value = createMemoryKeyValueStore();
});

describe('trimmed tool results', () => {
  it('keeps a trimmed result readable through its reference', async () => {
    const content = 'row\n'.repeat(5_000);
    expect(trimmedToolResultNotice('call_1')).toContain('read_tool_result with reference "call_1"');
    await expect(
      keepTrimmedToolResult({ userId: USER_ID, toolCallId: 'call_1', content }),
    ).resolves.toBe(true);
    const read = await readStoredToolResult(USER_ID, { reference: 'call_1', offset: 0 });
    expect(read.isError).toBe(false);
    expect(read.content).toContain('row\nrow');
    expect(read.content).toContain(`of ${content.length}.`);
  });

  it('leaves the full result an oversized notice already points to', async () => {
    const full = 'x'.repeat(MAX_EXECUTION_OUTPUT_BYTES + 10);
    const inline = await referenceOversizedToolResult({
      userId: USER_ID,
      toolCallId: 'call_2',
      toolName: 'connector__export',
      content: full,
    });
    expect(inline).not.toBeNull();
    await expect(
      keepTrimmedToolResult({ userId: USER_ID, toolCallId: 'call_2', content: inline! }),
    ).resolves.toBe(true);
    const read = await readStoredToolResult(USER_ID, { reference: 'call_2', offset: 0 });
    expect(read.content).toContain(`of ${full.length}.`);
  });

  it('keeps nothing without a store or a user', async () => {
    await expect(
      keepTrimmedToolResult({ userId: undefined, toolCallId: 'call_3', content: 'data' }),
    ).resolves.toBe(false);
    store.value = null;
    await expect(
      keepTrimmedToolResult({ userId: USER_ID, toolCallId: 'call_3', content: 'data' }),
    ).resolves.toBe(false);
  });

  it('reads a kept result back only for the user who produced it', async () => {
    await keepTrimmedToolResult({ userId: USER_ID, toolCallId: 'call_4', content: 'private' });
    const read = await readStoredToolResult('user-2', { reference: 'call_4', offset: 0 });
    expect(read.isError).toBe(true);
  });
});

describe('oversized results handed over as a prefix', () => {
  it('reports the full size and how much was kept', async () => {
    const kept = 'y'.repeat(MAX_EXECUTION_OUTPUT_BYTES + 10);
    const inline = await referenceOversizedToolResult({
      userId: USER_ID,
      toolCallId: 'call_5',
      toolName: 'execute_code',
      content: kept,
      totalChars: kept.length * 20,
    });
    expect(inline).toContain(`This result is ${kept.length * 20} characters`);
    expect(inline).toContain(`only the first ${kept.length} characters were kept`);
  });
});

describe('trimToolResultHistoryKeepingReferences', () => {
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
    await expect(
      trimToolResultHistoryKeepingReferences(messages, { userId: USER_ID }, 2_500, 1),
    ).resolves.toBe(2);
    expect(messages[1]!.content).toBe(trimmedToolResultNotice('call_a'));
    expect(messages[3]!.content).toBe('recent');
    const read = await readStoredToolResult(USER_ID, { reference: 'call_a', offset: 0 });
    expect(read.content).toContain('aaaa');
    expect(read.content).toContain('of 3000.');
  });

  it('does not trim a reference notice again', async () => {
    const messages = history();
    await trimToolResultHistoryKeepingReferences(messages, { userId: USER_ID }, 100, 1);
    const once = messages.map((message) => message.content);
    await expect(
      trimToolResultHistoryKeepingReferences(messages, { userId: USER_ID }, 100, 1),
    ).resolves.toBe(0);
    expect(messages.map((message) => message.content)).toEqual(once);
  });

  it('falls back to the plain marker when nothing can be kept', async () => {
    const messages = history();
    await trimToolResultHistoryKeepingReferences(messages, { userId: undefined }, 2_500, 1);
    expect(messages[1]!.content).toMatch(/^\[earlier tool result omitted/);
  });
});

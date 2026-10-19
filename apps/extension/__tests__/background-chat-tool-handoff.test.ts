import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import {
  normalizeManagedCloudOwner,
  sameManagedCloudOwner,
} from '../src/features/cloud-bridge/managedCloudAuthority';
import {
  CHAT_BROWSER_TASK_TOOL,
  CHAT_READ_PAGE_TOOL,
  CHAT_TOOL_HANDOFF_TIMEOUT_MS,
  chatBrowserToolDefinitions,
  isChatBrowserToolTier,
  MAX_CHAT_TOOL_CALLS_PER_HANDOFF,
  MAX_CHAT_TOOL_RESULT_CHARS,
} from '../src/features/computer-use/chatBrowserTools';
import { CHAT_SEARCH_HISTORY_TOOL } from '../src/features/computer-use/historySearch';
import type { ChromeManagedToolHandoffOutcome } from '../src/features/cloud-bridge/managedChatHandler';
import type { ToolCall } from '../src/features/computer-use/toolHandoff';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/background.ts'),
  'utf8',
);
const start = source.indexOf('interface PendingChatToolHandoff');
const end = source.indexOf('const oneTimeSiteGrantTimers', start);
if (start < 0 || end < start) throw new Error('Background tool handoff bridge was not found');

const OWNER = { accountId: 'user-a', authIncarnation: 'session-a' };
const CALLS: ToolCall[] = [
  { id: 'call_1', type: 'function', function: { name: CHAT_READ_PAGE_TOOL, arguments: '{}' } },
];

function bridge(sendMessage = vi.fn(async () => undefined)) {
  const compiled = ts.transpileModule(
    `${source.slice(start, end)}\nreturn { requestChatToolHandoff, resolveChatToolHandoff, pending: pendingChatToolHandoffs };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  const dependencies = {
    chrome: { runtime: { sendMessage } },
    normalizeManagedCloudOwner,
    sameManagedCloudOwner,
    isChatBrowserToolTier,
    chatBrowserToolDefinitions,
    MAX_CHAT_TOOL_CALLS_PER_HANDOFF,
    MAX_CHAT_TOOL_RESULT_CHARS,
    CHAT_TOOL_HANDOFF_TIMEOUT_MS,
  };
  // llm-guardrail-allow: executes repository-owned extension code inside this isolated test fixture.
  const api = new Function(...Object.keys(dependencies), compiled.outputText)(
    ...Object.values(dependencies),
  ) as {
    requestChatToolHandoff(
      active: { owner: typeof OWNER; clientInstanceId: string; controller: AbortController },
      streamId: string,
      calls: ToolCall[],
    ): Promise<ChromeManagedToolHandoffOutcome>;
    resolveChatToolHandoff(message: Record<string, unknown>): boolean;
    pending: Map<string, unknown>;
  };
  return { ...api, sendMessage };
}

function activeStream() {
  return { owner: OWNER, clientInstanceId: 'panel-a', controller: new AbortController() };
}

describe('background chat tool handoff bridge', () => {
  it('asks the owning panel and continues with its results and tool tier', async () => {
    const b = bridge();
    const outcome = b.requestChatToolHandoff(activeStream(), 'stream-1', CALLS);
    const sent = b.sendMessage.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent).toMatchObject({
      type: 'CHAT_TOOL_HANDOFF',
      owner: OWNER,
      clientInstanceId: 'panel-a',
      id: 'stream-1',
      calls: CALLS,
    });
    expect(
      b.resolveChatToolHandoff({
        owner: OWNER,
        clientInstanceId: 'panel-a',
        id: 'stream-1',
        handoffId: sent['handoffId'],
        results: [{ toolCallId: 'call_1', content: 'Page text' }],
        browserToolTier: 'act',
      }),
    ).toBe(true);
    const resolved = await outcome;
    expect(resolved).toMatchObject({
      status: 'resolved',
      results: [{ toolCallId: 'call_1', content: 'Page text' }],
    });
    expect(
      resolved.status === 'resolved' && resolved.tools?.map((tool) => tool.function.name),
    ).toEqual([CHAT_READ_PAGE_TOOL, CHAT_BROWSER_TASK_TOOL]);
    expect(b.pending.size).toBe(0);
  });

  it.each([
    ['another account', { owner: { accountId: 'user-b', authIncarnation: 'session-b' } }],
    ['another panel', { clientInstanceId: 'panel-b' }],
    ['another stream', { id: 'stream-2' }],
    ['a result for a call it was not asked', { results: [{ toolCallId: 'call_9', content: 'x' }] }],
    ['a missing result', { results: [] }],
    [
      'an oversized result',
      { results: [{ toolCallId: 'call_1', content: 'x'.repeat(MAX_CHAT_TOOL_RESULT_CHARS + 1) }] },
    ],
    ['an unknown tool tier', { browserToolTier: 'everything' }],
    ['a history flag that is not true', { browserHistory: 'yes' }],
  ])('refuses an answer from %s', async (_label, override) => {
    const b = bridge();
    void b.requestChatToolHandoff(activeStream(), 'stream-1', CALLS);
    const handoffId = (b.sendMessage.mock.calls[0]![0] as Record<string, unknown>)['handoffId'];
    expect(
      b.resolveChatToolHandoff({
        owner: OWNER,
        clientInstanceId: 'panel-a',
        id: 'stream-1',
        handoffId,
        results: [{ toolCallId: 'call_1', content: 'Page text' }],
        ...override,
      }),
    ).toBe(false);
    expect(b.pending.size).toBe(1);
  });

  it('keeps offering history search after the step only while the panel says it is on', async () => {
    const b = bridge();
    const outcome = b.requestChatToolHandoff(activeStream(), 'stream-1', CALLS);
    const handoffId = (b.sendMessage.mock.calls[0]![0] as Record<string, unknown>)['handoffId'];
    b.resolveChatToolHandoff({
      owner: OWNER,
      clientInstanceId: 'panel-a',
      id: 'stream-1',
      handoffId,
      results: [{ toolCallId: 'call_1', content: 'Page text' }],
      browserHistory: true,
    });
    const resolved = await outcome;
    expect(
      resolved.status === 'resolved' && resolved.tools?.map((tool) => tool.function.name),
    ).toEqual([CHAT_SEARCH_HISTORY_TOOL]);
  });

  it('ends the tool step when the user stops the turn', async () => {
    const b = bridge();
    const active = activeStream();
    const outcome = b.requestChatToolHandoff(active, 'stream-1', CALLS);
    active.controller.abort();
    await expect(outcome).resolves.toEqual({ status: 'cancelled' });
    expect(b.pending.size).toBe(0);
  });

  it('honours a cancel from the panel', async () => {
    const b = bridge();
    const outcome = b.requestChatToolHandoff(activeStream(), 'stream-1', CALLS);
    const handoffId = (b.sendMessage.mock.calls[0]![0] as Record<string, unknown>)['handoffId'];
    b.resolveChatToolHandoff({
      owner: OWNER,
      clientInstanceId: 'panel-a',
      id: 'stream-1',
      handoffId,
      cancelled: true,
    });
    await expect(outcome).resolves.toEqual({ status: 'cancelled' });
  });

  it('tells the model the tool could not run when no panel is listening', async () => {
    const b = bridge(vi.fn(async () => Promise.reject(new Error('Receiving end does not exist'))));
    await expect(b.requestChatToolHandoff(activeStream(), 'stream-1', CALLS)).resolves.toEqual({
      status: 'resolved',
      results: [
        {
          toolCallId: 'call_1',
          content: 'The side panel closed, so the browser tool could not run.',
        },
      ],
    });
  });
});

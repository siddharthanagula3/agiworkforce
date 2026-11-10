import { parseTaskTabScope, type TaskTabScope } from '../src/features/browser-tools/taskTabScope';
import { TOOL_CALL_ID_MAX_LENGTH } from '@agiworkforce/cloud-contracts';
import { parseCallerBrowserContext } from '../src/features/cloud-bridge/callerBrowserContext';
import { validChatToolResults } from '../src/features/computer-use/chatToolResults';
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
  CHAT_AUTOFILL_TOOL,
  CHAT_READ_PAGE_TOOL,
  CHAT_TOOL_HANDOFF_TIMEOUT_MS,
  chatBrowserToolDefinitions,
  isChatBrowserToolTier,
  MAX_CHAT_TOOL_CALLS_PER_HANDOFF,
  MAX_CHAT_TOOL_RESULT_CHARS,
} from '../src/features/computer-use/chatBrowserTools';
import { CHAT_SEARCH_HISTORY_TOOL } from '../src/features/computer-use/historySearch';
import type { ChromeManagedToolHandoffOutcome } from '../src/features/cloud-bridge/managedChatHandler';
import type { ToolCall, CallerToolContinuation } from '../src/features/computer-use/toolHandoff';
import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';

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
    `${source.slice(start, end)}\nreturn { requestChatToolHandoff, resolveChatToolHandoff, bindCallerBrowserTask, pending: pendingChatToolHandoffs };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  );
  const dependencies = {
    validChatToolResults,
    parseCallerBrowserContext,
    parseTaskTabScope,
    readChromeCallerToolCustody: vi.fn(async () => ({
      binding: {
        browserContext: {
          tabId: 17,
          windowId: 3,
          url: 'https://example.test/form',
          documentId: 'original-document',
        },
      },
      step: {
        cursor: {
          schema_version: AGENT_EVENT_SCHEMA_VERSION,
          next_event_sequence: 8,
          turn_id: 'fixture-turn',
        },
        calls: [{ id: 'call_1', function: { name: CHAT_BROWSER_TASK_TOOL } }],
        actions: [{ callId: 'call_1', state: 'in_flight' }],
      },
    })),
    assertCallerConversationAuthority: vi.fn(async () => undefined),
    readCallerBrowserContext: vi.fn(async (context, assertCurrent) => {
      assertCurrent();
      return context;
    }),
    TOOL_CALL_ID_MAX_LENGTH,
    CHAT_BROWSER_TASK_TOOL,
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
      checkpoint?: CallerToolContinuation,
    ): Promise<ChromeManagedToolHandoffOutcome>;
    bindCallerBrowserTask(
      value: unknown,
      owner: typeof OWNER,
      runId: string,
    ): {
      isCurrent(): boolean;
      assertPage(tabId: number): Promise<void>;
      assertAuthority(): Promise<void>;
      fail(): void;
      attachCancellation(cancel: () => void): void;
      complete(
        context: { tabId: number; windowId: number; url: string; documentId: string },
        scope: TaskTabScope,
      ): void;
    };
    resolveChatToolHandoff(message: Record<string, unknown>): boolean;
    pending: Map<string, unknown>;
  };
  return { ...api, sendMessage, authority: dependencies.assertCallerConversationAuthority };
}

function activeStream() {
  return { owner: OWNER, clientInstanceId: 'panel-a', controller: new AbortController() };
}

describe('background chat tool handoff bridge', () => {
  it('promotes only the native completion of the linked caller task, ignoring panel context claims', async () => {
    const b = bridge();
    const calls = [
      {
        ...CALLS[0]!,
        function: { name: CHAT_BROWSER_TASK_TOOL, arguments: '{"goal":"Open jobs"}' },
      },
    ];
    const checkpoint = {
      schema_version: AGENT_EVENT_SCHEMA_VERSION,
      run_id: '11111111-1111-4111-8111-111111111111',
      turn_id: 'fixture-turn',
      next_event_sequence: 8,
      calls,
    };
    const pending = b.requestChatToolHandoff(activeStream(), 'stream-task', calls, checkpoint);
    const sent = b.sendMessage.mock.calls[0]![0] as Record<string, unknown>;
    const link = {
      handoffId: sent.handoffId,
      toolCallId: calls[0]!.id,
      clientInstanceId: 'panel-a',
      streamId: 'stream-task',
    };
    expect(() =>
      b.bindCallerBrowserTask(link, { ...OWNER, accountId: 'other' }, 'native-task'),
    ).toThrow();
    const task = b.bindCallerBrowserTask(link, OWNER, 'native-task');
    await expect(task.assertPage(99)).rejects.toThrow('owned caller page');
    await expect(task.assertPage(17)).resolves.toBeUndefined();
    b.authority.mockRejectedValueOnce(new Error('The workspace changed.'));
    await expect(task.assertAuthority()).rejects.toThrow('workspace changed');
    expect(() => b.bindCallerBrowserTask(link, OWNER, 'duplicate-task')).toThrow();
    const native = {
      tabId: 18,
      windowId: 3,
      url: 'https://example.test/jobs',
      documentId: 'native-document',
    };
    const result = {
      owner: OWNER,
      clientInstanceId: 'panel-a',
      id: 'stream-task',
      handoffId: sent.handoffId,
      results: [
        {
          toolCallId: calls[0]!.id,
          content: 'Opened.',
          browserContext: { ...native, tabId: 99 },
          taskTabs: [{ ...native, closeable: true }],
        },
      ],
    };
    expect(b.resolveChatToolHandoff(result)).toBe(false);
    const scope: TaskTabScope = [
      {
        tabId: 17,
        windowId: 3,
        url: 'https://example.test/form',
        documentId: 'original-document',
        closeable: false,
      },
      { ...native, closeable: true },
    ];
    task.complete(native, scope);
    expect(b.resolveChatToolHandoff(result)).toBe(true);
    await expect(pending).resolves.toMatchObject({
      status: 'resolved',
      results: [
        { toolCallId: calls[0]!.id, content: 'Opened.', browserContext: native, taskTabs: scope },
      ],
    });
    expect(task.isCurrent()).toBe(false);
    expect(() => task.complete(native, scope)).toThrow();
  });

  it('returns a native task failure without promoting a page or waiting for a timeout', async () => {
    const b = bridge();
    const calls = [
      {
        ...CALLS[0]!,
        function: { name: CHAT_BROWSER_TASK_TOOL, arguments: '{"goal":"Open jobs"}' },
      },
    ];
    const checkpoint = {
      schema_version: AGENT_EVENT_SCHEMA_VERSION,
      run_id: '11111111-1111-4111-8111-111111111111',
      turn_id: 'fixture-turn',
      next_event_sequence: 8,
      calls,
    };
    const pending = b.requestChatToolHandoff(activeStream(), 'stream-task', calls, checkpoint);
    const sent = b.sendMessage.mock.calls[0]![0] as Record<string, unknown>;
    const task = b.bindCallerBrowserTask(
      {
        handoffId: sent.handoffId,
        toolCallId: calls[0]!.id,
        clientInstanceId: 'panel-a',
        streamId: 'stream-task',
      },
      OWNER,
      'native-task',
    );
    task.fail();
    expect(
      b.resolveChatToolHandoff({
        owner: OWNER,
        clientInstanceId: 'panel-a',
        id: 'stream-task',
        handoffId: sent.handoffId,
        results: [{ toolCallId: calls[0]!.id, content: 'The native task failed.' }],
      }),
    ).toBe(true);
    await expect(pending).resolves.toMatchObject({
      status: 'resolved',
      results: [{ content: 'The native task failed.' }],
    });
    expect(
      (await pending).status === 'resolved' &&
        ((await pending) as { results: object[] }).results[0],
    ).not.toHaveProperty('browserContext');
  });

  it('abandons a native child when its parent caller handoff is cancelled', async () => {
    const b = bridge();
    const calls = [
      {
        ...CALLS[0]!,
        function: { name: CHAT_BROWSER_TASK_TOOL, arguments: '{"goal":"Open jobs"}' },
      },
    ];
    const checkpoint = {
      schema_version: AGENT_EVENT_SCHEMA_VERSION,
      run_id: '11111111-1111-4111-8111-111111111111',
      turn_id: 'fixture-turn',
      next_event_sequence: 8,
      calls,
    };
    const active = activeStream();
    const pending = b.requestChatToolHandoff(active, 'stream-task', calls, checkpoint);
    const sent = b.sendMessage.mock.calls[0]![0] as Record<string, unknown>;
    const task = b.bindCallerBrowserTask(
      {
        handoffId: sent.handoffId,
        toolCallId: calls[0]!.id,
        clientInstanceId: 'panel-a',
        streamId: 'stream-task',
      },
      OWNER,
      'native-task',
    );
    const cancel = vi.fn();
    task.attachCancellation(cancel);
    active.controller.abort();
    await expect(pending).resolves.toEqual({ status: 'cancelled' });
    expect(cancel).toHaveBeenCalledOnce();
    expect(task.isCurrent()).toBe(false);
  });

  it('accepts a complete negotiated result without weakening legacy limits', async () => {
    const b = bridge();
    const checkpoint = {
      schema_version: AGENT_EVENT_SCHEMA_VERSION,
      run_id: '11111111-1111-4111-8111-111111111111',
      turn_id: 'fixture-turn',
      next_event_sequence: 8,
      calls: CALLS,
    };
    const pending = b.requestChatToolHandoff(activeStream(), 'stream-complete', CALLS, checkpoint);
    const sent = b.sendMessage.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent['callerCheckpoint']).toMatchObject({ run_id: checkpoint.run_id });
    const content = 'x'.repeat(MAX_CHAT_TOOL_RESULT_CHARS + 100);
    expect(
      b.resolveChatToolHandoff({
        owner: OWNER,
        clientInstanceId: 'panel-a',
        id: 'stream-complete',
        handoffId: sent['handoffId'],
        results: [{ toolCallId: 'call_1', content }],
      }),
    ).toBe(true);
    expect(await pending).toMatchObject({
      status: 'resolved',
      results: [{ toolCallId: 'call_1', content }],
    });
  });

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
    ).toEqual([CHAT_READ_PAGE_TOOL, CHAT_BROWSER_TASK_TOOL, CHAT_AUTOFILL_TOOL]);
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

  it('does not invent a negotiated receipt when its panel cannot answer', async () => {
    const b = bridge(vi.fn(async () => Promise.reject(new Error('Receiving end does not exist'))));
    const checkpoint = {
      schema_version: AGENT_EVENT_SCHEMA_VERSION,
      run_id: '11111111-1111-4111-8111-111111111111',
      turn_id: 'fixture-turn',
      next_event_sequence: 8,
      calls: CALLS,
    };
    await expect(
      b.requestChatToolHandoff(activeStream(), 'stream-1', CALLS, checkpoint),
    ).resolves.toEqual({ status: 'cancelled' });
    expect(b.pending.size).toBe(0);
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

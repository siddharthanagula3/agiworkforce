import type { CallerBrowserContext } from '../src/features/cloud-bridge/callerBrowserContext';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  MAX_CHAT_COMPLETION_REQUEST_BYTES,
} from '@agiworkforce/cloud-contracts';
import {
  createChromeCallerToolCustody,
  readChromeCallerToolCustody,
  type CallerToolCustodyStorage,
} from '../src/features/cloud-bridge/callerToolCustody';
import {
  executeOwnedCallerToolCalls,
  recoverCallerToolCheckpoint,
} from '../src/features/cloud-bridge/callerToolExecution';
import {
  CHAT_BROWSER_TASK_TOOL,
  chatBrowserToolDefinitions,
} from '../src/features/computer-use/chatBrowserTools';
const owner = { accountId: 'fixture-account', authIncarnation: 'fixture-session' };
const runId = '11111111-1111-4111-8111-111111111111';
const tools = chatBrowserToolDefinitions('read');
const checkpoint = () => ({
  schema_version: AGENT_EVENT_SCHEMA_VERSION,
  run_id: runId,
  turn_id: 'fixture-turn',
  next_event_sequence: 8,
  calls: ['one', 'two'].map((id) => ({
    id,
    type: 'function' as const,
    function: { name: tools[0]!.function.name, arguments: '{}' },
  })),
});
async function fixture(browserContext?: CallerBrowserContext, offering = tools) {
  let values: Record<string, unknown> = {};
  const storage: CallerToolCustodyStorage = {
    quotaBytes: MAX_CHAT_COMPLETION_REQUEST_BYTES * 2,
    get: async () => structuredClone(values),
    set: async (input) => {
      values = structuredClone({ ...values, ...input });
    },
  };
  const custody = createChromeCallerToolCustody(
    {
      owner,
      clientInstanceId: 'fixture-panel',
      streamId: 'fixture-stream',
      historyConversationId: 'fixture-local',
      ...(browserContext ? { browserContext } : {}),
    },
    () => undefined,
    storage,
  );
  await custody.admit('fixture-request', offering);
  await custody.bindRun(runId);
  return {
    storage,
    custody,
    read: async () => (await readChromeCallerToolCustody(owner, runId, () => undefined, storage))!,
  };
}
describe('owned caller checkpoint recovery', () => {
  it('saves the native task page with its result before dispatching the next sibling', async () => {
    const original = {
      tabId: 17,
      windowId: 3,
      url: 'https://example.test/form',
      documentId: 'original-document',
    };
    const next = {
      tabId: 18,
      windowId: 3,
      url: 'https://example.test/jobs',
      documentId: 'task-document',
    };
    const h = await fixture(original, chatBrowserToolDefinitions('act'));
    const step = {
      ...checkpoint(),
      calls: [
        {
          ...checkpoint().calls[0]!,
          function: { name: CHAT_BROWSER_TASK_TOOL, arguments: '{"goal":"Open jobs"}' },
        },
        checkpoint().calls[1]!,
      ],
    };
    await h.custody.claim(step);
    const contexts: CallerBrowserContext[] = [];
    const outcome = await executeOwnedCallerToolCalls({
      checkpoint: step,
      custody: h.custody,
      beforeAction: async () => {
        const saved = await h.read();
        contexts.push((saved.currentBrowserContext ?? saved.binding.browserContext)!);
      },
      dispatch: async (calls) => ({
        status: 'resolved',
        results: [
          {
            toolCallId: calls[0]!.id,
            content: calls[0]!.id,
            ...(calls[0]!.id === 'one'
              ? {
                  browserContext: next,
                  taskTabs: [
                    { ...original, closeable: false },
                    { ...next, closeable: true },
                  ],
                }
              : {}),
          },
        ],
      }),
    });
    expect(outcome.status).toBe('resolved');
    expect(contexts).toEqual([original, next]);
    expect((await h.read()).currentBrowserContext).toEqual(next);
    expect((await h.read()).taskTabs?.find((tab) => tab.tabId === 18)?.closeable).toBe(true);
    const dispatch = vi.fn();
    const receipt = await recoverCallerToolCheckpoint({
      saved: await h.read(),
      checkpoint: step,
      storage: h.storage,
      dispatch,
      assertCurrent: () => undefined,
      beforeAction: async () => {
        throw new Error('Completed actions require no new page access');
      },
    });
    expect(receipt.tool_results).toHaveLength(2);
    expect(dispatch).not.toHaveBeenCalled();
    expect((await h.read()).currentBrowserContext).toEqual(next);
  });

  it('reattaches an unstarted sibling to the saved native task destination without repeating the task', async () => {
    const original = {
      tabId: 17,
      windowId: 3,
      url: 'https://example.test/form',
      documentId: 'original-document',
    };
    const next = {
      tabId: 18,
      windowId: 3,
      url: 'https://example.test/jobs',
      documentId: 'task-document',
    };
    const h = await fixture(original, chatBrowserToolDefinitions('act'));
    const step = {
      ...checkpoint(),
      calls: [
        {
          ...checkpoint().calls[0]!,
          function: { name: CHAT_BROWSER_TASK_TOOL, arguments: '{"goal":"Open jobs"}' },
        },
        checkpoint().calls[1]!,
      ],
    };
    await h.custody.claim(step);
    await h.custody.claimAction(step, 'one');
    await h.custody.completeAction(
      step,
      { tool_call_id: 'one', content: 'Task completed' },
      null,
      next,
    );
    const beforeAction = vi.fn(async () => {
      expect((await h.read()).currentBrowserContext).toEqual(next);
    });
    const dispatch = vi.fn(async (calls) => ({
      status: 'resolved' as const,
      results: [{ toolCallId: calls[0].id, content: 'Read the new page' }],
    }));
    const receipt = await recoverCallerToolCheckpoint({
      saved: await h.read(),
      checkpoint: step,
      storage: h.storage,
      dispatch,
      assertCurrent: () => undefined,
      beforeAction,
    });
    expect(dispatch).toHaveBeenCalledExactlyOnceWith([step.calls[1]], step);
    expect(beforeAction).toHaveBeenCalledOnce();
    expect(receipt.tool_results).toEqual([
      { tool_call_id: 'one', content: 'Task completed' },
      { tool_call_id: 'two', content: 'Read the new page' },
    ]);
  });

  it('replays known results and executes only an unstarted sibling before one aggregate receipt', async () => {
    const h = await fixture(),
      step = checkpoint();
    await h.custody.claim(step);
    await h.custody.claimAction(step, 'one');
    await h.custody.completeAction(step, { tool_call_id: 'one', content: 'Saved one' });
    const dispatch = vi.fn(async (calls) => ({
      status: 'resolved' as const,
      results: [{ toolCallId: calls[0].id, content: 'New two' }],
    }));
    const beforeAction = vi.fn(async () => undefined);
    const receipt = await recoverCallerToolCheckpoint({
      saved: await h.read(),
      checkpoint: step,
      storage: h.storage,
      assertCurrent: () => undefined,
      beforeAction,
      dispatch,
    });
    expect(receipt.tool_results).toEqual([
      { tool_call_id: 'one', content: 'Saved one' },
      { tool_call_id: 'two', content: 'New two' },
    ]);
    expect(beforeAction).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0]![0][0].id).toBe('two');
  });
  it('reuses a completed receipt even when no live page is available', async () => {
    const h = await fixture(),
      step = checkpoint();
    await h.custody.claim(step);
    const dispatch = vi.fn(async (calls) => ({
      status: 'resolved' as const,
      results: [{ toolCallId: calls[0].id, content: calls[0].id }],
    }));
    const first = await recoverCallerToolCheckpoint({
      saved: await h.read(),
      checkpoint: step,
      storage: h.storage,
      assertCurrent: () => undefined,
      beforeAction: async () => undefined,
      dispatch,
    });
    dispatch.mockClear();
    const beforeAction = vi.fn(async () => {
      throw new Error('Page closed');
    });
    expect(
      await recoverCallerToolCheckpoint({
        saved: await h.read(),
        checkpoint: step,
        storage: h.storage,
        assertCurrent: () => undefined,
        beforeAction,
        dispatch,
      }),
    ).toEqual(first);
    expect(beforeAction).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('refuses a changed live checkpoint without dispatching', async () => {
    const h = await fixture(),
      step = checkpoint();
    await h.custody.claim(step);
    const changed = structuredClone(step);
    changed.calls[0]!.function.arguments = '{"changed":true}';
    const dispatch = vi.fn();
    await expect(
      recoverCallerToolCheckpoint({
        saved: await h.read(),
        checkpoint: changed,
        storage: h.storage,
        assertCurrent: () => undefined,
        beforeAction: async () => undefined,
        dispatch,
      }),
    ).rejects.toThrow('checkpoint changed');
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('refuses an uncertain action after a live checkpoint is confirmed', async () => {
    const h = await fixture(),
      step = checkpoint();
    await h.custody.claim(step);
    await h.custody.claimAction(step, 'one');
    const dispatch = vi.fn();
    await expect(
      recoverCallerToolCheckpoint({
        saved: await h.read(),
        checkpoint: step,
        storage: h.storage,
        assertCurrent: () => undefined,
        beforeAction: async () => undefined,
        dispatch,
      }),
    ).rejects.toThrow('may already have run');
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('does not use a completed-ID hint to bypass live authority for an unclaimed action', async () => {
    const h = await fixture(),
      step = checkpoint();
    await h.custody.claim(step);
    const dispatch = vi.fn();
    await expect(
      executeOwnedCallerToolCalls({
        checkpoint: step,
        custody: h.custody,
        completedCallIds: ['one', 'two'],
        beforeAction: async () => {
          throw new Error('Authority retired');
        },
        dispatch,
      }),
    ).rejects.toThrow('Authority retired');
    expect(dispatch).not.toHaveBeenCalled();
  });
});

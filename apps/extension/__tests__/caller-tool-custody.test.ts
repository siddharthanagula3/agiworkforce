import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  getPickerModels,
  getRoutingSlotModel,
} from '@agiworkforce/types';
import {
  MAX_CHAT_COMPLETION_REQUEST_BYTES,
  managedCloudAgentRunPath,
} from '@agiworkforce/cloud-contracts';
import {
  executeChromeManagedChat,
  type ChromeManagedChatDependencies,
} from '../src/features/cloud-bridge/managedChatHandler';
import type { FreeTrialChunk } from '../src/features/cloud-bridge/freeTrialClient';
import {
  CALLER_TOOL_CUSTODY_KEY,
  createChromeCallerToolCustody,
  readChromeCallerToolCustody,
  acknowledgeCompletedCallerRun,
  type CallerToolCustodyBinding,
  type ChromeCallerToolCustody,
  type CallerToolCustodyStorage,
} from '../src/features/cloud-bridge/callerToolCustody';
import {
  CHAT_BROWSER_TASK_TOOL,
  chatBrowserToolDefinitions,
  MAX_CHAT_TOOL_RESULT_CHARS,
} from '../src/features/computer-use/chatBrowserTools';

const binding: CallerToolCustodyBinding = {
  owner: { accountId: 'fixture-account', authIncarnation: 'fixture-session' },
  clientInstanceId: 'fixture-panel',
  streamId: 'fixture-stream',
  historyConversationId: 'fixture-conversation',
  originatingDocumentId: 'fixture-document',
};
const runId = '11111111-1111-4111-8111-111111111111';
const tools = chatBrowserToolDefinitions('read');
const checkpoint = (sequence = 8, id = 'read-one') => ({
  schema_version: AGENT_EVENT_SCHEMA_VERSION,
  run_id: runId,
  turn_id: 'fixture-turn',
  next_event_sequence: sequence,
  calls: [
    { id, type: 'function' as const, function: { name: tools[0]!.function.name, arguments: '{}' } },
  ],
});
const receipt = (value = checkpoint(), content = 'Actual browser result') => {
  const { calls, ...cursor } = value;
  return { ...cursor, tool_results: calls.map((call) => ({ tool_call_id: call.id, content })) };
};
async function recordFixtureActions(
  custody: ChromeCallerToolCustody,
  step: Parameters<ChromeCallerToolCustody['complete']>[0],
  value: Parameters<ChromeCallerToolCustody['complete']>[1],
) {
  for (const call of step.calls) {
    const result = value.tool_results.find((result) => result.tool_call_id === call.id);
    if (!result) throw new Error('Fixture is missing an action result');
    if (!(await custody.claimAction(step, call.id))) await custody.completeAction(step, result);
  }
}
function memoryStorage() {
  let state: Record<string, unknown> = {};
  const storage: CallerToolCustodyStorage = {
    quotaBytes: MAX_CHAT_COMPLETION_REQUEST_BYTES * 2,
    get: vi.fn(async () => structuredClone(state)),
    set: vi.fn(async (items) => {
      state = structuredClone({ ...state, ...items });
    }),
  };
  return {
    storage,
    read: () => structuredClone(state),
    replace: (value: unknown) => {
      state[CALLER_TOOL_CUSTODY_KEY] = value;
    },
  };
}
async function admitted(memory = memoryStorage()) {
  const assertCurrent = vi.fn();
  const custody = createChromeCallerToolCustody(binding, assertCurrent, memory.storage);
  await custody.admit('fixture-request', tools);
  await custody.bindRun(runId);
  return { memory, custody, assertCurrent };
}

describe('durable caller tool custody', () => {
  it('atomically retains a completed task destination and preserves earlier form receipts', async () => {
    const memory = memoryStorage();
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
    const owned = { ...binding, browserContext: original };
    const offering = chatBrowserToolDefinitions('act');
    const custody = createChromeCallerToolCustody(owned, () => undefined, memory.storage);
    const observation = (page: typeof original) => ({
      tabId: page.tabId,
      url: page.url,
      documentId: page.documentId,
      formSnapshotId: '11111111-1111-4111-8111-111111111111',
    });
    await custody.admit('fixture-task-promotion', offering, observation(original));
    await custody.bindRun(runId);
    const step = {
      ...checkpoint(),
      calls: [
        checkpoint().calls[0]!,
        {
          id: 'task-one',
          type: 'function' as const,
          function: { name: CHAT_BROWSER_TASK_TOOL, arguments: '{"goal":"Open jobs"}' },
        },
        { ...checkpoint().calls[0]!, id: 'read-after' },
      ],
    };
    await custody.claim(step);
    const before = { tool_call_id: step.calls[0]!.id, content: 'Original form' };
    await custody.claimAction(step, before.tool_call_id);
    await custody.completeAction(step, before, observation(original));
    const task = { tool_call_id: 'task-one', content: 'Opened jobs' };
    await custody.claimAction(step, task.tool_call_id);
    const taskTabs = [
      { ...original, closeable: false },
      { ...next, closeable: true },
    ];
    await custody.completeAction(step, task, null, next, taskTabs);
    await expect(custody.completeAction(step, task, null, { ...next, tabId: 99 })).rejects.toThrow(
      'different receipt or page context',
    );
    const after = { tool_call_id: 'read-after', content: 'Jobs page' };
    await custody.claimAction(step, after.tool_call_id);
    await custody.completeAction(step, after, observation(next));
    const saved = await readChromeCallerToolCustody(
      binding.owner,
      runId,
      () => undefined,
      memory.storage,
    );
    expect(saved?.binding.browserContext).toEqual(original);
    expect(saved?.currentBrowserContext).toEqual(next);
    expect(saved?.taskTabs).toEqual(taskTabs);
    expect(saved?.browserObservation).toEqual(observation(next));
    expect(saved?.step?.actions?.[0]?.observation).toEqual(observation(original));
    const restored = createChromeCallerToolCustody(owned, () => undefined, memory.storage);
    await restored.admit('fixture-task-promotion', offering);
    await expect(restored.claimAction(step, task.tool_call_id)).resolves.toEqual(task);
    await restored.complete(step, { ...receipt(step), tool_results: [before, task, after] });
    expect(
      (await readChromeCallerToolCustody(binding.owner, runId, () => undefined, memory.storage))
        ?.currentBrowserContext,
    ).toEqual(next);
    expect(
      (await readChromeCallerToolCustody(binding.owner, runId, () => undefined, memory.storage))
        ?.taskTabs,
    ).toEqual(taskTabs);
    await restored.finish();
    expect(
      (await readChromeCallerToolCustody(binding.owner, runId, () => undefined, memory.storage))
        ?.taskTabs,
    ).toBeUndefined();
    expect(
      (await readChromeCallerToolCustody(binding.owner, runId, () => undefined, memory.storage))
        ?.currentBrowserContext,
    ).toBeUndefined();
  });

  it('refuses context promotion by a read receipt', async () => {
    const memory = memoryStorage();
    const original = {
      tabId: 17,
      windowId: 3,
      url: 'https://example.test/form',
      documentId: 'original-document',
    };
    const custody = createChromeCallerToolCustody(
      { ...binding, browserContext: original },
      () => undefined,
      memory.storage,
    );
    await custody.admit('fixture-task-promotion', tools);
    await custody.bindRun(runId);
    const step = checkpoint();
    await custody.claim(step);
    await custody.claimAction(step, step.calls[0]!.id);
    await expect(
      custody.completeAction(step, { tool_call_id: step.calls[0]!.id, content: 'read' }, null, {
        ...original,
        tabId: 18,
      }),
    ).rejects.toThrow();
    const saved = await readChromeCallerToolCustody(
      binding.owner,
      runId,
      () => undefined,
      memory.storage,
    );
    expect(saved?.currentBrowserContext).toBeUndefined();
    expect(saved?.step?.actions?.[0]?.state).toBe('in_flight');
  });

  it.each([
    { tabId: 18, windowId: 4, url: 'https://example.test/jobs', documentId: 'task-document' },
    { tabId: 18, windowId: 3, url: 'https://example.test/jobs' },
    { tabId: 18, windowId: 3, url: 'javascript:alert(1)', documentId: 'task-document' },
  ])('refuses an invalid native task destination $windowId/$url/$documentId', async (next) => {
    const memory = memoryStorage();
    const original = {
      tabId: 17,
      windowId: 3,
      url: 'https://example.test/form',
      documentId: 'original-document',
    };
    const custody = createChromeCallerToolCustody(
      { ...binding, browserContext: original },
      () => undefined,
      memory.storage,
    );
    await custody.admit('fixture-task-promotion', chatBrowserToolDefinitions('act'));
    await custody.bindRun(runId);
    const step = {
      ...checkpoint(),
      calls: [
        {
          id: 'task-one',
          type: 'function' as const,
          function: { name: CHAT_BROWSER_TASK_TOOL, arguments: '{"goal":"Open jobs"}' },
        },
      ],
    };
    await custody.claim(step);
    await custody.claimAction(step, 'task-one');
    await expect(
      custody.completeAction(step, { tool_call_id: 'task-one', content: 'Opened.' }, null, next),
    ).rejects.toThrow();
    const saved = await readChromeCallerToolCustody(
      binding.owner,
      runId,
      () => undefined,
      memory.storage,
    );
    expect(saved?.currentBrowserContext).toBeUndefined();
    expect(saved?.step?.actions?.[0]?.state).toBe('in_flight');
  });

  it('refuses a completed task that upgrades user-owned tab close authority', async () => {
    const memory = memoryStorage();
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
    const custody = createChromeCallerToolCustody(
      { ...binding, browserContext: original },
      () => undefined,
      memory.storage,
    );
    await custody.admit('fixture-task-tabs', chatBrowserToolDefinitions('act'));
    await custody.bindRun(runId);
    const step = {
      ...checkpoint(),
      calls: [
        {
          id: 'task-one',
          type: 'function' as const,
          function: { name: CHAT_BROWSER_TASK_TOOL, arguments: '{"goal":"Open jobs"}' },
        },
      ],
    };
    await custody.claim(step);
    await custody.claimAction(step, 'task-one');
    await expect(
      custody.completeAction(step, { tool_call_id: 'task-one', content: 'Opened.' }, null, next, [
        { ...original, closeable: true },
        { ...next, closeable: true },
      ]),
    ).rejects.toThrow('user-owned');
    const scope = [
      { ...original, closeable: false },
      { ...next, closeable: true },
      {
        tabId: 19,
        windowId: 3,
        url: 'https://example.test/attached',
        documentId: 'attached-document',
        closeable: false,
      },
    ];
    await custody.completeAction(
      step,
      { tool_call_id: 'task-one', content: 'Opened.' },
      null,
      next,
      scope,
    );
    await custody.complete(step, {
      ...receipt(step),
      tool_results: [{ tool_call_id: 'task-one', content: 'Opened.' }],
    });
    const second = {
      ...step,
      next_event_sequence: 9,
      calls: [{ ...step.calls[0]!, id: 'task-two' }],
    };
    await custody.claim(second);
    await custody.claimAction(second, 'task-two');
    await expect(
      custody.completeAction(
        second,
        { tool_call_id: 'task-two', content: 'Closed.' },
        null,
        next,
        scope.map((tab) => (tab.tabId === 19 ? { ...tab, closeable: true } : tab)),
      ),
    ).rejects.toThrow('user-owned');
    const saved = await readChromeCallerToolCustody(
      binding.owner,
      runId,
      () => undefined,
      memory.storage,
    );
    expect(saved?.taskTabs).toEqual(scope);
    expect(saved?.step?.actions?.[0]?.state).toBe('in_flight');
  });

  it('retains the original offering without sharing caller-owned objects', async () => {
    const memory = memoryStorage();
    const offered = structuredClone([...tools]);
    const expected = structuredClone(offered);
    const custody = createChromeCallerToolCustody(binding, () => undefined, memory.storage);
    await custody.admit('fixture-request', offered);
    offered[0]!.function.name = 'later-tool';
    const saved = memory.read()[CALLER_TOOL_CUSTODY_KEY] as {
      entries: Array<{ toolsJson: string }>;
    };
    expect(JSON.parse(saved.entries[0]!.toolsJson)).toEqual(expected);
    const restart = createChromeCallerToolCustody(binding, () => undefined, memory.storage);
    await expect(restart.admit('fixture-request', offered)).rejects.toThrow(
      'original browser tool offering',
    );
    expect(memory.read()).toEqual({ [CALLER_TOOL_CUSTODY_KEY]: saved });
  });

  it('does not dispatch before the durable claim resolves', async () => {
    const { memory, custody } = await admitted();
    let release: () => void = () => undefined;
    const priorSet = memory.storage.set;
    let enteredSet = false;
    memory.storage.set = async (items) => {
      enteredSet = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await priorSet(items);
    };
    const effect = vi.fn();
    const pending = custody.claim(checkpoint()).then(effect);
    await vi.waitFor(() => expect(enteredSet).toBe(true));
    expect(effect).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      const state = memory.read()[CALLER_TOOL_CUSTODY_KEY] as {
        entries: Array<{ step?: unknown }>;
      };
      expect(state.entries[0]!.step).toBeUndefined();
    });
    release();
    await pending;
    expect(effect).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('refuses an unresolved action after worker reconstruction', async () => {
    const { memory, custody } = await admitted();
    expect(await custody.claim(checkpoint())).toBeNull();
    const restart = createChromeCallerToolCustody(binding, () => undefined, memory.storage);
    await restart.admit('fixture-request', tools);
    await restart.bindRun(runId);
    await expect(restart.claim(checkpoint())).rejects.toThrow('may already have run');
    await expect(restart.finish()).rejects.toThrow('outcome is uncertain');
  });

  it('replays complete results verbatim after worker reconstruction', async () => {
    const { memory, custody } = await admitted();
    const step = checkpoint();
    const original = {
      ...receipt(step, 'v'.repeat(MAX_CHAT_TOOL_RESULT_CHARS + 17)),
      observations: [{ text: 'Verified DOM output' }],
    };
    await custody.claim(step);
    await recordFixtureActions(custody, step, original);
    await custody.complete(step, original);
    original.tool_results[0]!.content = 'Changed later';
    const restart = createChromeCallerToolCustody(binding, () => undefined, memory.storage);
    await restart.admit('fixture-request', tools);
    const replay = await restart.claim(step);
    expect(replay!.tool_results[0]!.content).toBe('v'.repeat(MAX_CHAT_TOOL_RESULT_CHARS + 17));
    expect(replay!.observations).toEqual([{ text: 'Verified DOM output' }]);
    replay!.tool_results[0]!.content = 'Changed replay';
    expect((await restart.claim(step))!.tool_results[0]!.content).toHaveLength(
      MAX_CHAT_TOOL_RESULT_CHARS + 17,
    );
  });

  it('serializes concurrent duplicate claims across store instances', async () => {
    const { memory, custody } = await admitted();
    const duplicate = createChromeCallerToolCustody(binding, () => undefined, memory.storage);
    await duplicate.admit('fixture-request', tools);
    const outcomes = await Promise.allSettled([
      custody.claim(checkpoint()),
      duplicate.claim(checkpoint()),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
  });

  it('rejects changed calls at the same cursor and foreign runs', async () => {
    const { custody } = await admitted();
    const step = checkpoint();
    await custody.claim(step);
    await recordFixtureActions(custody, step, receipt(step));
    await custody.complete(step, receipt(step));
    await expect(custody.claim(checkpoint(8, 'another-call'))).rejects.toThrow(
      'checkpoint changed',
    );
    await expect(
      custody.claim({ ...checkpoint(12), run_id: '22222222-2222-4222-8222-222222222222' }),
    ).rejects.toThrow('original run');
  });

  it('does not re-admit the same request from a changed panel or conversation', async () => {
    const { memory } = await admitted();
    for (const next of [
      { ...binding, clientInstanceId: 'another-panel' },
      { ...binding, historyConversationId: 'another-conversation' },
    ]) {
      const candidate = createChromeCallerToolCustody(next, () => undefined, memory.storage);
      await expect(candidate.admit('fixture-request', tools)).rejects.toThrow('owner changed');
    }
  });

  it('separates account and sign-in incarnations without exposing old records', async () => {
    const { memory, custody } = await admitted();
    await custody.claim(checkpoint());
    const foreign = createChromeCallerToolCustody(
      { ...binding, owner: { ...binding.owner, authIncarnation: 'another-session' } },
      () => undefined,
      memory.storage,
    );
    await foreign.admit('fixture-request', tools);
    await expect(foreign.bindRun(runId)).rejects.toThrow('different admission');
    await expect(foreign.claim(checkpoint())).rejects.toThrow('original run');
  });

  it('keeps action identities after an acknowledged cursor advance', async () => {
    const { custody } = await admitted();
    const first = checkpoint();
    await custody.claim(first);
    await recordFixtureActions(custody, first, receipt(first));
    await custody.complete(first, receipt(first));
    const second = checkpoint(12, 'read-two');
    expect(await custody.claim(second)).toBeNull();
    await recordFixtureActions(custody, second, receipt(second));
    await custody.complete(second, receipt(second));
    await expect(custody.claim(checkpoint(16))).rejects.toThrow('repeated an action');
    await expect(custody.claim(first)).rejects.toThrow('stale action checkpoint');
  });

  it('requires a complete matching receipt and refuses contradictory duplicates', async () => {
    const { custody } = await admitted();
    const step = checkpoint();
    await custody.claim(step);
    await expect(custody.complete(step, receipt(checkpoint(8, 'unknown')))).rejects.toThrow(
      'does not match',
    );
    await recordFixtureActions(custody, step, receipt(step));
    await custody.complete(step, receipt(step));
    await expect(custody.complete(step, receipt(step, 'A different result'))).rejects.toThrow(
      'different receipt',
    );
  });

  it('retains the in-flight claim if receipt storage fails', async () => {
    const { memory, custody } = await admitted();
    await custody.claim(checkpoint());
    await recordFixtureActions(custody, checkpoint(), receipt());
    vi.mocked(memory.storage.set).mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(custody.complete(checkpoint(), receipt())).rejects.toThrow('Storage unavailable');
    const restart = createChromeCallerToolCustody(binding, () => undefined, memory.storage);
    await restart.admit('fixture-request', tools);
    await expect(restart.claim(checkpoint())).rejects.toThrow('may already have run');
  });

  it('refuses corrupt state and full storage without resetting admissions', async () => {
    const { memory, custody } = await admitted();
    memory.replace({ version: 1, entries: [{ requestId: 'fixture-request' }] });
    const before = memory.read();
    await expect(custody.claim(checkpoint())).rejects.toThrow('state is invalid');
    expect(memory.read()).toEqual(before);
    memory.replace({ version: 1, entries: [] });
    memory.storage.quotaBytes = 100;
    await expect(custody.admit('another-request', tools)).rejects.toThrow('storage is full');
  });

  it('retains a compact terminal tombstone against old request replay', async () => {
    const { memory, custody } = await admitted();
    await custody.claim(checkpoint());
    await recordFixtureActions(custody, checkpoint(), receipt());
    await custody.complete(checkpoint(), receipt());
    await custody.finish();
    const restart = createChromeCallerToolCustody(binding, () => undefined, memory.storage);
    await expect(restart.admit('fixture-request', tools)).rejects.toThrow('already finished');
    const state = memory.read()[CALLER_TOOL_CUSTODY_KEY] as {
      entries: Array<Record<string, unknown>>;
    };
    expect(state.entries[0]).toMatchObject({
      terminal: true,
      toolsJson: '[]',
      previousCallIds: [],
    });
    expect(state.entries[0]).not.toHaveProperty('step');
  });

  it('checks live owner admission again after a storage await', async () => {
    const memory = memoryStorage();
    let current = true;
    const assertCurrent = () => {
      if (!current) throw new Error('Owner retired');
    };
    const custody = createChromeCallerToolCustody(binding, assertCurrent, memory.storage);
    await custody.admit('fixture-request', tools);
    await custody.bindRun(runId);
    const set = memory.storage.set;
    memory.storage.set = async (items) => {
      await set(items);
      current = false;
    };
    await expect(custody.claim(checkpoint())).rejects.toThrow('Owner retired');
    current = true;
    memory.storage.set = set;
    const restart = createChromeCallerToolCustody(binding, assertCurrent, memory.storage);
    await restart.admit('fixture-request', tools);
    await expect(restart.claim(checkpoint())).rejects.toThrow('may already have run');
  });
});

function stream(...chunks: FreeTrialChunk[]): AsyncGenerator<FreeTrialChunk> {
  return (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
}
function managedDependencies(
  overrides: Partial<ChromeManagedChatDependencies>,
): ChromeManagedChatDependencies {
  return {
    getAuthToken: vi.fn(async () => 'fixture-token'),
    getModelAccess: vi.fn(async () => ({
      subscriptionTier: 'pro',
      modelIds: getPickerModels().map((model) => model.id),
      allowedAutoModes: ['auto'],
    })),
    onText: vi.fn(),
    streamChat: vi.fn(() => stream({ type: 'done' })),
    ...overrides,
  };
}

describe('managed handler with real durable custody', () => {
  const request = {
    id: binding.streamId,
    text: 'Read the current page.',
    modelSelection: getRoutingSlotModel('workhorse_general'),
    tools,
    idempotencyKey: 'fixture-request',
  };
  const run: Extract<FreeTrialChunk, { type: 'run' }> = {
    type: 'run',
    run: { runId, runPath: managedCloudAgentRunPath(runId), lastSequence: -1 },
  };
  const handoff: Extract<FreeTrialChunk, { type: 'tool-handoff' }> = {
    type: 'tool-handoff',
    calls: checkpoint().calls,
    continuation: checkpoint(),
  };

  it('reposts a persisted result after cancellation without repeating the browser action', async () => {
    const memory = memoryStorage();
    const controller = new AbortController();
    const originalSet = memory.storage.set;
    memory.storage.set = async (items) => {
      await originalSet(items);
      const saved = items[CALLER_TOOL_CUSTODY_KEY] as {
        entries: Array<{ step?: { state: string } }>;
      };
      if (saved.entries[0]?.step?.state === 'completed') controller.abort();
    };
    const execute = vi.fn(async () => ({
      status: 'resolved' as const,
      results: [{ toolCallId: 'read-one', content: 'A real executor receipt' }],
    }));
    const initial = managedDependencies({
      callerCustody: createChromeCallerToolCustody(
        binding,
        () => controller.signal.throwIfAborted(),
        memory.storage,
      ),
      streamChat: vi.fn(() => stream(run, handoff, { type: 'done' })),
      onToolHandoff: execute,
    });
    expect(
      await executeChromeManagedChat({ ...request, signal: controller.signal }, initial),
    ).toMatchObject({ status: 'error', code: 'cancelled' });
    expect(execute).toHaveBeenCalledOnce();
    expect(initial.streamChat).toHaveBeenCalledOnce();
    const stored = memory.read()[CALLER_TOOL_CUSTODY_KEY] as {
      entries: Array<{ step?: { state: string; receipt: unknown } }>;
    };
    expect(stored.entries[0]!.step).toMatchObject({
      state: 'completed',
      receipt: receipt(checkpoint(), 'A real executor receipt'),
    });
    memory.storage.set = originalSet;
    const resumed = managedDependencies({
      callerCustody: createChromeCallerToolCustody(binding, () => undefined, memory.storage),
      streamChat: vi
        .fn()
        .mockReturnValueOnce(stream(run, handoff, { type: 'done' }))
        .mockReturnValueOnce(
          stream(
            { type: 'text', text: 'Done.' },
            { ...run, run: { ...run.run, state: 'completed' } },
            { type: 'done' },
          ),
        ),
      onToolHandoff: execute,
    });
    expect((await executeChromeManagedChat(request, resumed)).status).toBe('success');
    expect(execute).toHaveBeenCalledOnce();
    const resumedOptions = vi.mocked(resumed.streamChat).mock.calls[1]![2];
    expect(resumedOptions && !('aborted' in resumedOptions) && resumedOptions.callerResume).toEqual(
      receipt(checkpoint(), 'A real executor receipt'),
    );
    expect(
      (memory.read()[CALLER_TOOL_CUSTODY_KEY] as { entries: Array<{ terminal: boolean }> })
        .entries[0]!.terminal,
    ).toBe(true);
  });

  it('retains separate admissions for legacy continuation requests with distinct runs', async () => {
    const memory = memoryStorage();
    const nextRunId = '22222222-2222-4222-8222-222222222222';
    const deps = managedDependencies({
      callerCustody: createChromeCallerToolCustody(binding, () => undefined, memory.storage),
      streamChat: vi
        .fn()
        .mockReturnValueOnce(
          stream(run, { type: 'tool-handoff', calls: checkpoint().calls }, { type: 'done' }),
        )
        .mockReturnValueOnce(
          stream(
            {
              type: 'run',
              run: { ...run.run, runId: nextRunId, runPath: managedCloudAgentRunPath(nextRunId) },
            },
            { type: 'text', text: 'Done.' },
            { type: 'done' },
          ),
        ),
      onToolHandoff: vi.fn(async () => ({
        status: 'resolved',
        results: [{ toolCallId: 'read-one', content: 'Fixture executor receipt' }],
      })),
    });
    expect((await executeChromeManagedChat(request, deps)).status).toBe('success');
    expect(deps.onToolHandoff).toHaveBeenCalledOnce();
    const saved = memory.read()[CALLER_TOOL_CUSTODY_KEY] as { entries: Array<{ runId: string }> };
    expect(saved.entries.map((entry) => entry.runId)).toEqual([runId, nextRunId]);
  });

  it('retains a completed receipt when a negotiated stream has no terminal task state', async () => {
    const memory = memoryStorage();
    const deps = managedDependencies({
      callerCustody: createChromeCallerToolCustody(binding, () => undefined, memory.storage),
      streamChat: vi
        .fn()
        .mockReturnValueOnce(stream(run, handoff, { type: 'done' }))
        .mockReturnValueOnce(
          stream({ type: 'text', text: 'Text without a terminal task receipt.' }, { type: 'done' }),
        ),
      onToolHandoff: vi.fn(async () => ({
        status: 'resolved',
        results: [{ toolCallId: 'read-one', content: 'Fixture executor receipt' }],
      })),
    });
    expect((await executeChromeManagedChat(request, deps)).status).toBe('success');
    const saved = memory.read()[CALLER_TOOL_CUSTODY_KEY] as {
      entries: Array<{ terminal: boolean; step?: { state: string } }>;
    };
    expect(saved.entries[0]).toMatchObject({ terminal: false, step: { state: 'completed' } });
  });

  it('retains the original admission across a hosted approval pause', async () => {
    const memory = memoryStorage();
    const deps = managedDependencies({
      callerCustody: createChromeCallerToolCustody(binding, () => undefined, memory.storage),
      streamChat: vi.fn(() =>
        stream({ ...run, run: { ...run.run, state: 'awaiting_approval' } }, { type: 'done' }),
      ),
    });
    expect((await executeChromeManagedChat(request, deps)).status).toBe('success');
    const saved = memory.read()[CALLER_TOOL_CUSTODY_KEY] as {
      entries: Array<{ terminal: boolean; runId: string; toolsJson: string }>;
    };
    expect(saved.entries[0]).toMatchObject({ terminal: false, runId });
    expect(JSON.parse(saved.entries[0]!.toolsJson)).toEqual(tools);
  });

  it('does not claim or dispatch an individual action when live authority fails', async () => {
    const memory = memoryStorage();
    const deps = managedDependencies({
      callerCustody: createChromeCallerToolCustody(binding, () => undefined, memory.storage),
      beforeCallerAction: vi.fn(async () => {
        throw new Error('Original authority changed');
      }),
      onToolHandoff: vi.fn(),
      streamChat: vi.fn(() => stream(run, handoff, { type: 'done' })),
    });
    expect((await executeChromeManagedChat(request, deps)).status).toBe('error');
    expect(deps.onToolHandoff).not.toHaveBeenCalled();
    expect(
      (await readChromeCallerToolCustody(binding.owner, runId, () => undefined, memory.storage))
        ?.step?.actions,
    ).toEqual([]);
  });
  it('persists each negotiated result before dispatching the next sibling without adding model legs', async () => {
    const memory = memoryStorage();
    const pair = checkpoint();
    pair.calls.push({ ...structuredClone(pair.calls[0]!), id: 'read-two' });
    const execute = vi.fn(async (calls) => {
      expect(calls).toHaveLength(1);
      const saved = memory.read()[CALLER_TOOL_CUSTODY_KEY] as {
        entries: Array<{ step: { actions: Array<{ callId: string; state: string }> } }>;
      };
      const actions = saved.entries[0]!.step.actions;
      expect(actions.at(-1)).toMatchObject({ callId: calls[0].id, state: 'in_flight' });
      if (calls[0].id === 'read-two')
        expect(actions[0]).toMatchObject({ callId: 'read-one', state: 'completed' });
      return {
        status: 'resolved' as const,
        results: [{ toolCallId: calls[0].id, content: `Verified ${calls[0].id}` }],
      };
    });
    const deps = managedDependencies({
      callerCustody: createChromeCallerToolCustody(binding, () => undefined, memory.storage),
      onToolHandoff: execute,
      streamChat: vi
        .fn()
        .mockReturnValueOnce(
          stream(
            run,
            { type: 'tool-handoff', calls: pair.calls, continuation: pair },
            { type: 'done' },
          ),
        )
        .mockImplementationOnce((_messages, _token, options) => {
          expect(options.callerResume.tool_results).toEqual([
            { tool_call_id: 'read-one', content: 'Verified read-one' },
            { tool_call_id: 'read-two', content: 'Verified read-two' },
          ]);
          return stream(
            { ...run, run: { ...run.run, state: 'completed' } },
            { type: 'text', text: 'Done.' },
            { type: 'done' },
          );
        }),
    });
    expect((await executeChromeManagedChat(request, deps)).status).toBe('success');
    expect(execute).toHaveBeenCalledTimes(2);
    expect(deps.streamChat).toHaveBeenCalledTimes(2);
  });

  it.each(['cancelled', 'foreign-result'] as const)(
    'retains the known prefix and unknown last action after %s',
    async (fault) => {
      const memory = memoryStorage();
      const pair = checkpoint();
      pair.calls.push({ ...structuredClone(pair.calls[0]!), id: 'read-two' });
      const execute = vi.fn(async (calls) => {
        if (calls[0].id === 'read-one')
          return {
            status: 'resolved' as const,
            results: [{ toolCallId: 'read-one', content: 'Verified first action' }],
          };
        return fault === 'cancelled'
          ? { status: 'cancelled' as const }
          : {
              status: 'resolved' as const,
              results: [{ toolCallId: 'foreign-call', content: 'Wrong result' }],
            };
      });
      const deps = managedDependencies({
        callerCustody: createChromeCallerToolCustody(binding, () => undefined, memory.storage),
        onToolHandoff: execute,
        streamChat: vi.fn(() =>
          stream(
            run,
            { type: 'tool-handoff', calls: pair.calls, continuation: pair },
            { type: 'done' },
          ),
        ),
      });
      expect(await executeChromeManagedChat(request, deps)).toMatchObject({
        status: 'error',
        code: fault === 'cancelled' ? 'cancelled' : 'protocol_error',
      });
      const restart = createChromeCallerToolCustody(binding, () => undefined, memory.storage);
      await restart.admit('fixture-request', tools);
      expect(await restart.claimAction(pair, 'read-one')).toEqual({
        tool_call_id: 'read-one',
        content: 'Verified first action',
      });
      await expect(restart.claimAction(pair, 'read-two')).rejects.toThrow('may already have run');
      expect(execute).toHaveBeenCalledTimes(2);
      expect(deps.streamChat).toHaveBeenCalledOnce();
    },
  );

  it('refuses a first checkpoint from a different run before dispatch', async () => {
    const memory = memoryStorage();
    const foreign = {
      ...handoff,
      continuation: { ...checkpoint(), run_id: '22222222-2222-4222-8222-222222222222' },
    };
    const deps = managedDependencies({
      callerCustody: createChromeCallerToolCustody(binding, () => undefined, memory.storage),
      streamChat: vi.fn(() => stream(run, foreign, { type: 'done' })),
      onToolHandoff: vi.fn(),
    });
    expect(await executeChromeManagedChat(request, deps)).toMatchObject({
      status: 'error',
      code: 'protocol_error',
    });
    expect(deps.onToolHandoff).not.toHaveBeenCalled();
    expect(deps.streamChat).toHaveBeenCalledOnce();
  });
});

describe('owned caller run lookup', () => {
  it('recovers the original offering and complete receipt by run identity', async () => {
    const { memory, custody } = await admitted();
    await custody.claim(checkpoint());
    await recordFixtureActions(custody, checkpoint(), receipt());
    await custody.complete(checkpoint(), receipt());
    const saved = await readChromeCallerToolCustody(
      binding.owner,
      runId,
      () => undefined,
      memory.storage,
    );
    expect(JSON.parse(saved!.toolsJson)).toEqual(tools);
    expect(saved!.originalToolNames).toEqual(tools.map((tool) => tool.function.name));
    expect(saved!.step).toMatchObject({ state: 'completed', receipt: receipt() });
    saved!.binding.owner.accountId = 'later mutation';
    expect(
      (await readChromeCallerToolCustody(binding.owner, runId, () => undefined, memory.storage))!
        .binding.owner,
    ).toEqual(binding.owner);
  });
  it('does not expose a saved run to another account or sign-in incarnation', async () => {
    const { memory } = await admitted();
    for (const owner of [
      { ...binding.owner, accountId: 'other' },
      { ...binding.owner, authIncarnation: 'other' },
    ])
      expect(
        await readChromeCallerToolCustody(owner, runId, () => undefined, memory.storage),
      ).toBeNull();
  });
  it('distinguishes an unknown outcome from a completed receipt without writing storage', async () => {
    const { memory, custody } = await admitted();
    await custody.claim(checkpoint());
    const writes = vi.mocked(memory.storage.set).mock.calls.length;
    expect(
      (await readChromeCallerToolCustody(binding.owner, runId, () => undefined, memory.storage))!
        .step?.state,
    ).toBe('in_flight');
    expect(memory.storage.set).toHaveBeenCalledTimes(writes);
    expect(
      await readChromeCallerToolCustody(
        binding.owner,
        '33333333-3333-4333-8333-333333333333',
        () => undefined,
        memory.storage,
      ),
    ).toBeNull();
  });
  it('rejects retirement during the asynchronous read', async () => {
    const { memory } = await admitted();
    let current = true;
    const get = memory.storage.get;
    memory.storage.get = async (key) => {
      const value = await get(key);
      current = false;
      return value;
    };
    await expect(
      readChromeCallerToolCustody(
        binding.owner,
        runId,
        () => {
          if (!current) throw new Error('retired');
        },
        memory.storage,
      ),
    ).rejects.toThrow('retired');
  });
});

describe('confirmed caller receipt acknowledgement', () => {
  const completed = {
    runId,
    runPath: managedCloudAgentRunPath(runId),
    lastSequence: 12,
    state: 'completed' as const,
  };
  it('compacts a matching completed receipt after terminal journal proof', async () => {
    const { memory, custody } = await admitted();
    await custody.claim(checkpoint());
    await recordFixtureActions(custody, checkpoint(), receipt());
    await custody.complete(checkpoint(), receipt());
    expect(
      await acknowledgeCompletedCallerRun(
        binding.owner,
        completed,
        8,
        () => undefined,
        memory.storage,
      ),
    ).toBe(true);
    const saved = await readChromeCallerToolCustody(
      binding.owner,
      runId,
      () => undefined,
      memory.storage,
    );
    expect(saved).toMatchObject({ terminal: true, toolsJson: '[]', previousCallIds: [] });
    expect(saved).not.toHaveProperty('step');
  });
  it('does not erase an uncertain action or another owner receipt', async () => {
    const { memory, custody } = await admitted();
    await custody.claim(checkpoint());
    expect(
      await acknowledgeCompletedCallerRun(
        binding.owner,
        completed,
        8,
        () => undefined,
        memory.storage,
      ),
    ).toBe(false);
    expect(
      (await readChromeCallerToolCustody(binding.owner, runId, () => undefined, memory.storage))!
        .step?.state,
    ).toBe('in_flight');
    await recordFixtureActions(custody, checkpoint(), receipt());
    await custody.complete(checkpoint(), receipt());
    expect(
      await acknowledgeCompletedCallerRun(
        { ...binding.owner, authIncarnation: 'other' },
        completed,
        8,
        () => undefined,
        memory.storage,
      ),
    ).toBe(false);
  });
  it('retains a newer checkpoint when acknowledgement is stale', async () => {
    const { memory, custody } = await admitted();
    await custody.claim(checkpoint());
    await recordFixtureActions(custody, checkpoint(), receipt());
    await custody.complete(checkpoint(), receipt());
    const next = checkpoint(12, 'next-call');
    await custody.claim(next);
    await recordFixtureActions(custody, next, receipt(next));
    await custody.complete(next, receipt(next));
    expect(
      await acknowledgeCompletedCallerRun(
        binding.owner,
        completed,
        8,
        () => undefined,
        memory.storage,
      ),
    ).toBe(false);
    expect(
      (await readChromeCallerToolCustody(binding.owner, runId, () => undefined, memory.storage))!
        .step?.cursor.next_event_sequence,
    ).toBe(12);
  });
});

describe('original website admission identity', () => {
  const browserContext = {
    tabId: 17,
    windowId: 3,
    url: 'https://example.test/application',
    documentId: 'original-website-document',
  };
  it('preserves the website identity separately from the extension document', async () => {
    const memory = memoryStorage();
    const custody = createChromeCallerToolCustody(
      { ...binding, browserContext },
      () => undefined,
      memory.storage,
    );
    await custody.admit('website-context-request', tools);
    await custody.bindRun(runId);
    expect(
      (await readChromeCallerToolCustody(binding.owner, runId, () => undefined, memory.storage))
        ?.binding,
    ).toMatchObject({ originatingDocumentId: binding.originatingDocumentId, browserContext });
  });
  it('refuses re-admitting a request against another website document', async () => {
    const memory = memoryStorage();
    const first = createChromeCallerToolCustody(
      { ...binding, browserContext },
      () => undefined,
      memory.storage,
    );
    await first.admit('website-context-request', tools);
    const changed = createChromeCallerToolCustody(
      { ...binding, browserContext: { ...browserContext, documentId: 'replacement-document' } },
      () => undefined,
      memory.storage,
    );
    await expect(changed.admit('website-context-request', tools)).rejects.toThrow('owner changed');
  });
});

describe('individual caller tool receipts', () => {
  function twoCalls() {
    const step = checkpoint();
    step.calls.push({ ...structuredClone(step.calls[0]!), id: 'read-two' });
    return step;
  }
  it('reconstructs a completed prefix without repeating its effect and continues only unclaimed calls', async () => {
    const { memory, custody } = await admitted();
    const step = twoCalls();
    const effect = vi.fn((id: string) => ({ tool_call_id: id, content: `Verified ${id}` }));
    await custody.claim(step);
    await expect(custody.claimAction(step, 'read-two')).rejects.toThrow('previous browser action');
    expect(await custody.claimAction(step, 'read-one')).toBeNull();
    const first = effect('read-one');
    await custody.completeAction(step, first);
    const restart = createChromeCallerToolCustody(binding, () => undefined, memory.storage);
    await restart.admit('fixture-request', tools);
    expect(await restart.claimAction(step, 'read-one')).toEqual(first);
    expect(effect).toHaveBeenCalledTimes(1);
    expect(await restart.claimAction(step, 'read-two')).toBeNull();
    const second = effect('read-two');
    await restart.completeAction(step, second);
    const { calls: _calls, ...cursor } = step;
    const batch = { ...cursor, tool_results: [first, second] };
    expect(await restart.complete(step, batch)).toEqual(batch);
    expect(effect).toHaveBeenCalledTimes(2);
    expect(await restart.claimAction(step, 'read-one')).toEqual(first);
  });
  it('refuses an unknown individual outcome after reconstruction and prevents later sibling effects', async () => {
    const { memory, custody } = await admitted();
    const step = twoCalls();
    await custody.claim(step);
    await custody.claimAction(step, 'read-one');
    const restart = createChromeCallerToolCustody(binding, () => undefined, memory.storage);
    await restart.admit('fixture-request', tools);
    await expect(restart.claimAction(step, 'read-one')).rejects.toThrow('may already have run');
    await expect(restart.claimAction(step, 'read-two')).rejects.toThrow('previous browser action');
  });
  it('serializes duplicate per-call claims so only one executor may start', async () => {
    const { memory, custody } = await admitted();
    const step = checkpoint();
    await custody.claim(step);
    const duplicate = createChromeCallerToolCustody(binding, () => undefined, memory.storage);
    await duplicate.admit('fixture-request', tools);
    const effect = vi.fn();
    const outcomes = await Promise.allSettled([
      custody.claimAction(step, 'read-one').then(effect),
      duplicate.claimAction(step, 'read-one').then(effect),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(effect).toHaveBeenCalledOnce();
  });
  it('does not start an executor when its individual claim cannot be persisted', async () => {
    const { memory, custody } = await admitted();
    const step = checkpoint();
    await custody.claim(step);
    vi.mocked(memory.storage.set).mockRejectedValueOnce(new Error('claim unavailable'));
    const effect = vi.fn();
    await expect(custody.claimAction(step, 'read-one').then(effect)).rejects.toThrow(
      'claim unavailable',
    );
    expect(effect).not.toHaveBeenCalled();
  });
  it('retains an unknown claim when saving its actual result fails', async () => {
    const { memory, custody } = await admitted();
    const step = checkpoint();
    await custody.claim(step);
    await custody.claimAction(step, 'read-one');
    vi.mocked(memory.storage.set).mockRejectedValueOnce(new Error('receipt unavailable'));
    await expect(
      custody.completeAction(step, { tool_call_id: 'read-one', content: 'Effect finished' }),
    ).rejects.toThrow('receipt unavailable');
    const restart = createChromeCallerToolCustody(binding, () => undefined, memory.storage);
    await restart.admit('fixture-request', tools);
    await expect(restart.claimAction(step, 'read-one')).rejects.toThrow('may already have run');
  });
  it('requires matching per-call receipts before accepting a complete aggregate', async () => {
    const { custody } = await admitted();
    const step = checkpoint();
    await custody.claim(step);
    await expect(custody.complete(step, receipt(step))).rejects.toThrow('durable receipt');
    await expect(
      custody.completeAction(step, { tool_call_id: 'read-one', content: 'Unclaimed' }),
    ).rejects.toThrow('no durable claim');
    await custody.claimAction(step, 'read-one');
    await custody.completeAction(step, { tool_call_id: 'read-one', content: 'Original' });
    await expect(custody.complete(step, receipt(step, 'Changed'))).rejects.toThrow(
      'durable receipt',
    );
    await expect(
      custody.completeAction(step, { tool_call_id: 'read-one', content: 'Changed' }),
    ).rejects.toThrow('different receipt');
  });
  it('refuses a corrupt individual receipt without erasing or skipping its checkpoint', async () => {
    const { memory, custody } = await admitted();
    const step = checkpoint();
    await custody.claim(step);
    await custody.claimAction(step, 'read-one');
    await custody.completeAction(step, { tool_call_id: 'read-one', content: 'Verified result' });
    const saved = memory.read()[CALLER_TOOL_CUSTODY_KEY] as {
      entries: Array<{ step: { actions: Array<{ receipt: { tool_call_id: string } }> } }>;
    };
    saved.entries[0]!.step.actions[0]!.receipt.tool_call_id = 'foreign-action';
    memory.replace(saved);
    const before = memory.read();
    await expect(custody.claimAction(step, 'read-one')).rejects.toThrow('receipt is invalid');
    expect(memory.read()).toEqual(before);
  });

  it('does not assume an older in-flight batch has unclaimed actions', async () => {
    const { memory, custody } = await admitted();
    const step = checkpoint();
    await custody.claim(step);
    const saved = memory.read()[CALLER_TOOL_CUSTODY_KEY] as {
      entries: Array<{ step: { actions?: unknown } }>;
    };
    delete saved.entries[0]!.step.actions;
    memory.replace(saved);
    await expect(custody.claimAction(step, 'read-one')).rejects.toThrow('legacy outcome');
  });
});

describe('original caller conversation scope', () => {
  const conversationContext = {
    id: '33333333-3333-4333-8333-333333333333',
    organizationId: null,
    projectId: null,
  };
  it('retains acknowledged account scope through reconstruction', async () => {
    const memory = memoryStorage();
    const custody = createChromeCallerToolCustody(
      { ...binding, conversationContext },
      () => undefined,
      memory.storage,
    );
    await custody.admit('conversation-context-request', tools);
    await custody.bindRun(runId);
    expect(
      (await readChromeCallerToolCustody(binding.owner, runId, () => undefined, memory.storage))
        ?.binding.conversationContext,
    ).toEqual(conversationContext);
  });
  it.each([
    { ...conversationContext, projectId: 'another-project' },
    { ...conversationContext, organizationId: '44444444-4444-4444-8444-444444444444' },
  ])('does not re-admit another project or workspace %j', async (changed) => {
    const memory = memoryStorage();
    const first = createChromeCallerToolCustody(
      { ...binding, conversationContext },
      () => undefined,
      memory.storage,
    );
    await first.admit('conversation-context-request', tools);
    const other = createChromeCallerToolCustody(
      { ...binding, conversationContext: changed },
      () => undefined,
      memory.storage,
    );
    await expect(other.admit('conversation-context-request', tools)).rejects.toThrow(
      'owner changed',
    );
  });
  it('does not normalize an unknown workspace into personal scope', () => {
    expect(() =>
      createChromeCallerToolCustody(
        {
          ...binding,
          conversationContext: {
            id: conversationContext.id,
            projectId: null,
          } as typeof conversationContext,
        },
        () => undefined,
        memoryStorage().storage,
      ),
    ).toThrow('scope is invalid');
  });
});

describe('durable original form observation', () => {
  const page = {
    tabId: 17,
    windowId: 3,
    url: 'https://example.test/form',
    documentId: 'original-document',
  };
  const originalObservation = {
    tabId: 17,
    url: page.url,
    documentId: page.documentId,
    formSnapshotId: '55555555-5555-4555-8555-555555555555',
  };
  it('seeds an initial prefetched form before a hosted approval pause', async () => {
    const memory = memoryStorage();
    const deps = managedDependencies({
      callerCustody: createChromeCallerToolCustody(
        { ...binding, browserContext: page },
        () => undefined,
        memory.storage,
      ),
      streamChat: vi.fn(() =>
        stream(
          {
            type: 'run',
            run: {
              runId,
              runPath: managedCloudAgentRunPath(runId),
              lastSequence: 2,
              state: 'awaiting_approval',
            },
          },
          { type: 'done' },
        ),
      ),
    });
    expect(
      (
        await executeChromeManagedChat(
          {
            id: binding.streamId,
            text: 'Use this form after approval',
            tools,
            modelSelection: getRoutingSlotModel('workhorse_general'),
            browserObservation: originalObservation,
            idempotencyKey: 'initial-observation-request',
          },
          deps,
        )
      ).status,
    ).toBe('success');
    expect(
      (await readChromeCallerToolCustody(binding.owner, runId, () => undefined, memory.storage))
        ?.browserObservation,
    ).toEqual(originalObservation);
  });
  it('stores the native form reference with its result and retains it across acknowledged batches', async () => {
    const memory = memoryStorage();
    const custody = createChromeCallerToolCustody(
      { ...binding, browserContext: page },
      () => undefined,
      memory.storage,
    );
    await custody.admit('form-observation-request', tools);
    await custody.bindRun(runId);
    const step = checkpoint();
    await custody.claim(step);
    await custody.claimAction(step, 'read-one');
    const observation = { ...originalObservation };
    const complete = custody.completeAction(
      step,
      { tool_call_id: 'read-one', content: 'Observed form' },
      observation,
    );
    observation.formSnapshotId = '66666666-6666-4666-8666-666666666666';
    await complete;
    expect(
      (await readChromeCallerToolCustody(binding.owner, runId, () => undefined, memory.storage))
        ?.browserObservation,
    ).toEqual(originalObservation);
    await custody.complete(step, receipt(step, 'Observed form'));
    const next = checkpoint(12, 'read-two');
    await custody.claim(next);
    await custody.claimAction(next, 'read-two');
    expect(
      (await readChromeCallerToolCustody(binding.owner, runId, () => undefined, memory.storage))
        ?.browserObservation,
    ).toEqual(originalObservation);
    await custody.completeAction(
      next,
      { tool_call_id: 'read-two', content: 'Consumed form' },
      null,
    );
    expect(
      (await readChromeCallerToolCustody(binding.owner, runId, () => undefined, memory.storage))
        ?.browserObservation,
    ).toBeUndefined();
  });
  it('refuses a receipt reference from another document without changing the stored claim', async () => {
    const memory = memoryStorage();
    const custody = createChromeCallerToolCustody(
      { ...binding, browserContext: page },
      () => undefined,
      memory.storage,
    );
    await custody.admit('form-observation-request', tools);
    await custody.bindRun(runId);
    const step = checkpoint();
    await custody.claim(step);
    await custody.claimAction(step, 'read-one');
    const before = memory.read();
    await expect(
      custody.completeAction(
        step,
        { tool_call_id: 'read-one', content: 'Other document' },
        { ...originalObservation, documentId: 'replacement-document' },
      ),
    ).rejects.toThrow('original browser document');
    expect(memory.read()).toEqual(before);
  });
});

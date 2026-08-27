import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const _local: Record<string, unknown> = {};
const _session: Record<string, unknown> = {};

function selected(
  store: Record<string, unknown>,
  key: string | string[] | null,
): Record<string, unknown> {
  if (key === null) return { ...store };
  const keys = Array.isArray(key) ? key : [key];
  return Object.fromEntries(keys.map((entry) => [entry, store[entry]]));
}

const chromeMock = {
  storage: {
    local: {
      get: vi.fn((key: string | string[], cb: (res: Record<string, unknown>) => void) => {
        cb(selected(_local, key));
      }),
      set: vi.fn((items: Record<string, unknown>, cb?: () => void) => {
        for (const [k, v] of Object.entries(items)) _local[k] = v;
        cb?.();
      }),
      remove: vi.fn((keys: string | string[], cb?: () => void) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete _local[key];
        cb?.();
      }),
    },
    session: {
      get: vi.fn(async (key: string | string[] | null) => selected(_session, key)),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) _session[k] = v;
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete _session[key];
      }),
    },
  },
  runtime: { lastError: undefined as chrome.runtime.LastError | undefined, id: 'test-extension' },
};

(globalThis as unknown as Record<string, unknown>).chrome = chromeMock;

const {
  BACKGROUND_ANSWER_TRUNCATION_NOTICE,
  appendBackgroundTurn: appendOwnedBackgroundTurn,
  getActiveConversation: getOwnedActiveConversation,
  getConversation: getOwnedConversation,
  listConversations: listOwnedConversations,
  upsertConversation: upsertOwnedConversation,
} = await import('../src/features/background/conversation-history');
const {
  backgroundConversationId,
  createBackgroundChatDelivery,
  linkNotificationToConversation,
  notificationSnippet,
  recordBackgroundChatResult,
  setPendingResultConversation,
  takeNotificationConversation,
  takePendingResultConversation,
  OPEN_BROWSER_CONVERSATION_MESSAGE,
  SCHEDULED_TASK_CLIENT_ID,
  SHORTCUT_REPLAY_CLIENT_ID,
} = await import('../src/features/background/background-results');

const BROWSER_STORE_KEY = 'agi_browser_conversations_v2';
const OWNER = { accountId: 'account-a', authIncarnation: 'session-a' } as const;
const OTHER_OWNER = { accountId: 'account-b', authIncarnation: 'session-b' } as const;
const appendBackgroundTurn = (
  id: string,
  title: string,
  turn: { prompt: string; answer: string },
) => appendOwnedBackgroundTurn(OWNER, id, title, turn);
const getActiveConversation = () => getOwnedActiveConversation(OWNER);
const getConversation = (id: string) => getOwnedConversation(OWNER, id);
const listConversations = () => listOwnedConversations(OWNER);
const upsertConversation = (
  id: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>,
) => upsertOwnedConversation(OWNER, id, messages);
const recordResult = (target: ReturnType<typeof delivery>, answer: string) =>
  recordBackgroundChatResult(target, OWNER, answer);

function delivery(taskId = 'task_1700000000000_abcdef123456', name = 'Morning brief') {
  const built = createBackgroundChatDelivery('task', taskId, name, 'Summarize my inbox');
  if (!built) throw new Error('expected a delivery for a well-formed task id');
  return built;
}

beforeEach(() => {
  for (const key of Object.keys(_local)) delete _local[key];
  for (const key of Object.keys(_session)) delete _session[key];
  vi.clearAllMocks();
});

describe('a completed background run is retained', () => {
  it('keeps scheduled completion recoverable when durable answer proof fails', () => {
    const deliveryStart = background.indexOf('const deliverBackgroundResult = async');
    const chatFinally = background.indexOf('} finally {', deliveryStart);
    expect(deliveryStart).toBeGreaterThanOrEqual(0);
    expect(chatFinally).toBeGreaterThan(deliveryStart);
    const chatDelivery = background.slice(deliveryStart, chatFinally);

    expect(chatDelivery).toContain('if (!stored)');
    expect(chatDelivery).toContain('backgroundDeliveryFailure = message');
    expect(chatDelivery).toMatch(
      /const deliveryFailure = await deliverBackgroundResult\(result\.routing\);[\s\S]*scheduledTaskError\('server_error', deliveryFailure\)/,
    );
    expect(chatDelivery).not.toMatch(
      /catch \(error\) \{\s*logger\.error\('Failed to persist background chat result', error\);\s*\}/,
    );

    const resumeStart = background.indexOf('async function resumeScheduledTaskJournal');
    const resumeEnd = background.indexOf('function cancelledScheduledTaskOutcome', resumeStart);
    const resumeDelivery = background.slice(resumeStart, resumeEnd);
    expect(resumeDelivery).toContain('const stored = await recordBackgroundChatResult(');
    expect(resumeDelivery).toContain('deliveryFailure = !stored');
    expect(resumeDelivery).toContain("scheduledTaskError('server_error'");
  });

  it('files the answer where the panel History drawer reads it', async () => {
    const target = delivery();
    await recordResult(target, 'Three things happened overnight.');

    const stored = await getConversation(target.conversationId);
    expect(stored).toBeDefined();
    expect(stored?.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Summarize my inbox'],
      ['assistant', 'Three things happened overnight.'],
    ]);

    expect((await listConversations()).map((entry) => entry.id)).toContain(target.conversationId);
  });

  it('titles the entry with the task name, not the raw prompt', async () => {
    const target = delivery('task_1700000000000_abcdef123456', 'Morning brief');
    await recordResult(target, 'Answer.');
    expect((await getConversation(target.conversationId))?.title).toBe('Morning brief');
  });

  it('never steals the active conversation from an open side panel', async () => {
    await upsertConversation('conv-panel-owned', [
      { role: 'user', content: 'what the user is reading', timestamp: 1 },
    ]);
    expect((await getActiveConversation())?.id).toBe('conv-panel-owned');

    await recordResult(delivery(), 'Background answer.');

    expect((await getActiveConversation())?.id).toBe('conv-panel-owned');
  });

  it('accumulates repeated runs of the same task in one thread', async () => {
    const target = delivery();
    await recordResult(target, 'Run one.');
    await recordResult(target, 'Run two.');

    const stored = await getConversation(target.conversationId);
    expect(stored?.messages).toHaveLength(4);
    expect(stored?.messages.at(-1)?.content).toBe('Run two.');
    expect(
      (await listConversations()).filter((entry) => entry.id === target.conversationId),
    ).toHaveLength(1);
  });

  it('replaces a recovered partial delivery instead of duplicating the billed turn', async () => {
    const target = delivery();
    target.deliveryId = 'agi.chrome.task.delivery-1';
    await recordResult(target, 'Partial answer');
    await recordResult(target, 'Partial answer, now complete.');

    const stored = await getConversation(target.conversationId);
    expect(stored?.messages.map((message) => [message.role, message.content])).toEqual([
      ['user', 'Summarize my inbox'],
      ['assistant', 'Partial answer, now complete.'],
    ]);
    expect(
      stored?.messages.every(
        (message) => message.backgroundDeliveryId === 'agi.chrome.task.delivery-1',
      ),
    ).toBe(true);
  });

  it('makes an exact post-crash delivery retry a no-op', async () => {
    const target = delivery();
    target.deliveryId = 'agi.chrome.task.delivery-1';
    const delivered = vi.fn();
    target.onDelivered = delivered;

    await recordResult(target, 'Canonical answer.');
    await recordResult(target, 'Canonical answer.');

    expect(delivered).toHaveBeenCalledTimes(1);
    expect((await getConversation(target.conversationId))?.messages).toHaveLength(2);
  });

  it('bounds an ever-appending task thread', async () => {
    const target = delivery();
    for (let run = 0; run < 60; run += 1) {
      await recordResult(target, `Run ${run}.`);
    }
    const stored = await getConversation(target.conversationId);
    expect(stored?.messages.length).toBeLessThanOrEqual(100);
    expect(stored?.messages.at(-1)?.content).toBe('Run 59.');
  });

  it('reports the filed answer back to the dispatcher exactly once', async () => {
    const target = delivery();
    const seen: string[] = [];
    target.onDelivered = (answer) => seen.push(answer);

    await recordResult(target, 'Quotable answer.');
    expect(seen).toEqual(['Quotable answer.']);
  });

  it('persists and acknowledges an explicitly truncated 64,001-character answer', async () => {
    const target = delivery();
    const delivered = vi.fn();
    target.onDelivered = delivered;

    await recordResult(target, 'x'.repeat(64_001));

    const stored = await getConversation(target.conversationId);
    const storedAssistant = stored?.messages.at(-1);
    expect(stored?.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(storedAssistant?.content.length).toBeLessThanOrEqual(64_000);
    expect(storedAssistant?.content.endsWith(BACKGROUND_ANSWER_TRUNCATION_NOTICE)).toBe(true);
    expect(delivered).toHaveBeenCalledTimes(1);
    expect(delivered).toHaveBeenCalledWith(storedAssistant?.content, OWNER);
  });

  it('stores nothing and reports nothing when the run produced no text', async () => {
    const target = delivery();
    const seen: string[] = [];
    target.onDelivered = (answer) => seen.push(answer);

    expect(await recordResult(target, '   \n  ')).toBeUndefined();
    expect(seen).toEqual([]);
    expect(await getConversation(target.conversationId)).toBeUndefined();
    expect(await listConversations()).toEqual([]);
  });

  it('survives a storage round-trip through the store normalizer', async () => {
    const target = delivery();
    await recordResult(target, 'Persisted answer.');
    const raw = _local[BROWSER_STORE_KEY] as { conversations: Array<{ id: string }> };
    expect(raw.conversations.some((entry) => entry.id === target.conversationId)).toBe(true);
    expect((await getConversation(target.conversationId))?.messages.at(-1)?.content).toBe(
      'Persisted answer.',
    );
  });

  it('does not expose account A background history to account B', async () => {
    const target = delivery();
    await recordResult(target, 'Only account A may read this.');

    expect(await getOwnedConversation(OTHER_OWNER, target.conversationId)).toBeUndefined();
    expect(await listOwnedConversations(OTHER_OWNER)).toEqual([]);
  });
});

describe('background conversation identity', () => {
  it('is stable and namespaced per run kind', () => {
    expect(backgroundConversationId('task', 'task_1_abc')).toBe('bg-task-task_1_abc');
    expect(backgroundConversationId('shortcut', 'sc_1_abc')).toBe('bg-shortcut-sc_1_abc');
    expect(backgroundConversationId('task', 'task_1_abc')).toBe(
      backgroundConversationId('task', 'task_1_abc'),
    );
  });

  it('refuses an id the conversation store would reject instead of writing a bad record', () => {
    expect(backgroundConversationId('task', 'bad id ')).toBeUndefined();
    expect(backgroundConversationId('task', '')).toBeUndefined();
    expect(createBackgroundChatDelivery('task', 'bad id ', 'name', 'prompt')).toBeUndefined();
  });

  it('rejects an id the store would throw on', async () => {
    await expect(appendBackgroundTurn('', 'title', { prompt: 'p', answer: 'a' })).rejects.toThrow(
      /Invalid browser conversation id/,
    );
  });
});

describe('notification carries the result', () => {
  it('collapses and truncates the preview', () => {
    expect(notificationSnippet('  line one\n\nline two  ')).toBe('line one line two');
    expect(notificationSnippet('')).toBe('');
    const long = notificationSnippet('x'.repeat(400));
    expect(long.length).toBe(180);
    expect(long.endsWith('…')).toBe(true);
  });

  it('maps a notification to its result and clears the link once consumed', async () => {
    await linkNotificationToConversation('agi_notif_1', OWNER, 'bg-task-task_1');
    expect(await takeNotificationConversation('agi_notif_1', OWNER)).toBe('bg-task-task_1');
    expect(await takeNotificationConversation('agi_notif_1', OWNER)).toBeUndefined();
  });

  it('bounds unclicked links so a scheduler cannot fill session storage', async () => {
    for (let index = 0; index < 30; index += 1) {
      await linkNotificationToConversation(`agi_notif_${index}`, OWNER, `bg-task-task_${index}`);
    }
    const retained = Object.keys(_session).filter((key) => key.startsWith('agi_notif_conv_'));
    expect(retained).toHaveLength(20);
    expect(await takeNotificationConversation('agi_notif_29', OWNER)).toBe('bg-task-task_29');
    expect(await takeNotificationConversation('agi_notif_0', OWNER)).toBeUndefined();
  });

  it('parks and consumes the pointer a booting panel reads', async () => {
    expect(await takePendingResultConversation(OWNER)).toBeUndefined();
    await setPendingResultConversation(OWNER, 'bg-task-task_1');
    expect(await takePendingResultConversation(OWNER)).toBe('bg-task-task_1');
    expect(await takePendingResultConversation(OWNER)).toBeUndefined();
  });

  it('drops an account A notification pointer instead of opening it for account B', async () => {
    await setPendingResultConversation(OWNER, 'bg-task-task-a');

    expect(await takePendingResultConversation(OTHER_OWNER)).toBeUndefined();
    expect(await takePendingResultConversation(OWNER)).toBeUndefined();
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, '..', rel), 'utf8');
const background = read('src/background.ts');
const sidePanel = read('src/side_panel.ts');

describe('background dispatch is wired to the sink', () => {
  it('dispatches scheduled prompts and shortcut prompts under the shared client ids', () => {
    expect(background).toContain('clientInstanceId: SCHEDULED_TASK_CLIENT_ID');
    expect(background).toContain('clientInstanceId: SHORTCUT_REPLAY_CLIENT_ID');
    expect(background).not.toContain("clientInstanceId: 'scheduled-task'");
    expect(background).not.toContain("clientInstanceId: 'shortcut-replay'");
  });

  it('passes a delivery descriptor to handleChatMessage on both background paths', () => {
    expect(background).toMatch(
      /createBackgroundChatDelivery\(\s*'task',\s*initialJournal\.taskId,\s*initialJournal\.taskName,\s*initialJournal\.prompt,?\s*\)/,
    );
    expect(background).toMatch(
      /createBackgroundChatDelivery\(\s*'shortcut',\s*shortcut\.id,\s*shortcut\.name,\s*safePrompt,?\s*\)/,
    );
    expect(background).toContain(
      'executeScheduledTaskJournal(journal, credential, recover, signal)',
    );
    expect(background).toMatch(
      /handleChatMessage\(chatMsg, \{ id: chrome\.runtime\.id \}, delivery\)/,
    );
  });

  it('files the transcript on every terminal path, not only on success', () => {
    const calls = background.match(/await deliverBackgroundResult\(/g) ?? [];
    expect(calls.length).toBe(3);
    expect(background).toContain('if (delivery && text) transcript.push(text)');
  });

  it('journals scheduled Cloud work before dispatch and rejoins it after restart', () => {
    expect(background).toContain('beginScheduledTaskRunJournal({');
    expect(background).toContain('delivery.requestId = initialJournal.requestId');
    expect(background).toContain('delivery.deliveryId = initialJournal.requestId');
    expect(background).toMatch(/findChromeManagedRunByRequestId\(\s*state\.journal\.requestId,/);
    expect(background).toContain('resumeChromeManagedRun(');
    expect(background).toContain('.then(recoverScheduledTaskRuns)');
    // The periodic retry moved into the demand-driven maintenance pass, which
    // also decides whether an unfinished journal is worth another wake.
    expect(background).toMatch(
      /async function runMaintenancePass\(\)[\s\S]*?await recoverScheduledTaskRuns\(\);\s*outstanding = \(await loadScheduledTaskRunJournals\(\)\)\.length > 0;/,
    );
    expect(background).toContain("modelSelection: state.journal.routing?.modelKey ?? 'auto'");
    expect(background).toContain('await abandonScheduledTaskRun(journal, credential)');
    expect(background).toContain('active.requestId !== journal.requestId');
    expect(background).toMatch(
      /let systemPrompt: string \| undefined;\s*if \(!delivery\) \{\s*try \{/,
    );
  });

  it('binds prompt schedules to an account and preserves exact run incarnation checks', () => {
    expect(background).toContain('credential?.owner.accountId');
    expect(background).toContain('task.managedCloudAccountId !== credential.owner.accountId');
    expect(background).toContain('!sameManagedCloudOwner(journal.owner, credential.owner)');
  });

  it('lets a notification click open the conversation holding the answer', () => {
    expect(background).toContain(
      'linkNotificationToConversation(notifId, conversationOwner, conversationId)',
    );
    expect(background).toContain('takeNotificationConversation(notifId, credential.owner)');
    expect(background).toContain('setPendingResultConversation(credential.owner, conversationId)');
    expect(background).toMatch(
      /type: OPEN_BROWSER_CONVERSATION_MESSAGE,\s*owner: credential\.owner,\s*conversationId/,
    );
    expect(sidePanel).toContain('takePendingResultConversation(owner)');
  });

  it('keeps the schedule form open and renders authorization failures', () => {
    expect(sidePanel).toContain("class: 'sp-wf-form-error'");
    expect(sidePanel).toContain("ntSaveBtn.textContent = t('spTaskCreating')");
    expect(sidePanel).toContain('response?.success !== true');
    expect(sidePanel).toContain("runtimeError || response?.error || t('spTaskCreateFailed')");
  });
});

describe('the side panel can reach a stored background result', () => {
  it('consumes the parked pointer on boot', () => {
    expect(sidePanel).toContain('checkPendingBackgroundResult()');
    expect(sidePanel).toContain('takePendingResultConversation(owner)');
  });

  it('handles the open-conversation broadcast when it is already running', () => {
    expect(sidePanel).toContain('envelope.type === OPEN_BROWSER_CONVERSATION_MESSAGE');
    expect(sidePanel).toContain('openStoredConversation(request.conversationId)');
  });

  it('renders a View result control on task rows that have one', () => {
    expect(sidePanel).toContain("backgroundConversationId('task', task.id)");
    expect(sidePanel).toContain('storedConversationIds.has(resultConversationId)');
    expect(sidePanel).toContain("title: 'View last result'");
  });

  it('does the same for prompt shortcuts and opens the answer right after a replay', () => {
    expect(sidePanel).toContain("backgroundConversationId('shortcut', sc.id)");
    expect(sidePanel).toContain(
      'isPromptBased && resultConversationId && storedConversationIds.has(resultConversationId)',
    );
    expect(sidePanel).toContain('if (!isPromptBased || !resultConversationId) {');
    expect(sidePanel).toContain('openStoredConversation(resultConversationId).then((opened)');
  });
});

describe('shared client-id constants', () => {
  it('are the literals the schedulers previously inlined', () => {
    expect(SCHEDULED_TASK_CLIENT_ID).toBe('scheduled-task');
    expect(SHORTCUT_REPLAY_CLIENT_ID).toBe('shortcut-replay');
    expect(OPEN_BROWSER_CONVERSATION_MESSAGE).toBe('OPEN_BROWSER_CONVERSATION');
  });
});

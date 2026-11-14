import type { RemoteCodeToolRecord } from '@agiworkforce/types';
import type { RemoteCodeThread } from '../../remote-code/store';
import {
  buildCodeSessionTimeline,
  codeChangedFileCount,
  codeWorkLabel,
  codeWorkingLabel,
  countDiffLines,
  displayedCodeMessages,
} from '../codeSessionTimeline';

function thread(overrides: Partial<RemoteCodeThread> = {}): RemoteCodeThread {
  return {
    rootId: 'root-1',
    threadId: 'thread-1',
    title: 'Session',
    status: 'idle',
    activeTurnId: null,
    partialResponse: '',
    messages: [],
    pendingApprovals: [],
    approvalHolds: {},
    pendingQuestions: [],
    fileChanges: [],
    diffs: [],
    testRuns: [],
    tools: [],
    thinking: [],
    runningTasks: 0,
    transcript: null,
    queuedGuidance: [],
    hostMessage: null,
    syncedAt: '2026-09-17T12:00:00.000Z',
    ...overrides,
  };
}

function tool(id: string, turnId: string | null, state: RemoteCodeToolRecord['state'] = 'done') {
  return {
    toolCallId: id,
    name: 'shell',
    summary: `run ${id}`,
    state,
    output: '',
    ...(turnId ? { turnId } : {}),
  } satisfies RemoteCodeToolRecord;
}

const kinds = (value: RemoteCodeThread) =>
  buildCodeSessionTimeline(value).map((item) =>
    'text' in item ? `${item.kind}:${item.text}` : `${item.kind}:${item.tools.length}`,
  );

describe('displayedCodeMessages', () => {
  it('shows the session messages until a conversation page is read', () => {
    const messages = [{ role: 'user' as const, text: 'one' }];
    expect(displayedCodeMessages(thread({ messages }))).toBe(messages);
  });

  it('adds what came after the page and never repeats what the page holds', () => {
    const value = thread({
      transcript: {
        hasEarlier: false,
        messages: [
          { role: 'user', text: 'two', index: 2, turnId: 't2' },
          { role: 'assistant', text: 'two done, in full', index: 3, turnId: 't2' },
        ],
      },
      messages: [
        { role: 'assistant', text: 'one done', turnId: 't1' },
        { role: 'user', text: 'two', turnId: 't2' },
        { role: 'assistant', text: 'two done', turnId: 't2' },
        { role: 'user', text: 'three', turnId: 't3' },
        { role: 'assistant', text: 'no turn' },
      ],
    });

    expect(displayedCodeMessages(value).map((message) => message.text)).toEqual([
      'two',
      'two done, in full',
      'three',
    ]);
  });

  it('adds every message that has a turn when the page holds none of them', () => {
    const value = thread({
      transcript: { hasEarlier: false, messages: [{ role: 'user', text: 'old', index: 0 }] },
      messages: [
        { role: 'user', text: 'old' },
        { role: 'assistant', text: 'new', turnId: 't1' },
      ],
    });

    expect(displayedCodeMessages(value).map((message) => message.text)).toEqual(['old', 'new']);
  });
});

describe('buildCodeSessionTimeline', () => {
  it('puts a turn’s thinking and steps above its reply', () => {
    expect(
      kinds(
        thread({
          messages: [
            { role: 'user', text: 'ask', turnId: 't1' },
            { role: 'assistant', text: 'answer', turnId: 't1' },
          ],
          tools: [tool('a', 't1'), tool('b', 't1')],
          thinking: [{ turnId: 't1', text: 'hm' }],
        }),
      ),
    ).toEqual(['user:ask', 'thinking:hm', 'work:2', 'reply:answer']);
  });

  it('keeps the steps of a turn that ended without a reply under its message', () => {
    expect(
      kinds(
        thread({
          messages: [
            { role: 'user', text: 'first', turnId: 't1' },
            { role: 'user', text: 'second', turnId: 't2' },
            { role: 'assistant', text: 'second done', turnId: 't2' },
          ],
          tools: [tool('a', 't1', 'failed')],
        }),
      ),
    ).toEqual(['user:first', 'work:1', 'user:second', 'reply:second done']);
  });

  it('ends with the running turn: its thinking, steps, reply so far and queued messages', () => {
    const value = thread({
      status: 'running',
      activeTurnId: 't2',
      partialResponse: 'so far',
      messages: [
        { role: 'assistant', text: 'answer', turnId: 't1' },
        { role: 'user', text: 'next', turnId: 't2' },
      ],
      tools: [tool('old', null), tool('a', 't2', 'running')],
      thinking: [{ turnId: 't2', text: 'hm' }],
      queuedGuidance: ['later'],
    });

    expect(kinds(value)).toEqual([
      'reply:answer',
      'user:next',
      'work:1',
      'thinking:hm',
      'work:1',
      'partial:so far',
      'queued:later',
    ]);
    const live = buildCodeSessionTimeline(value).find((item) => item.kind === 'thinking');
    expect(live).toMatchObject({ live: true });
  });

  it('gives every row its own key', () => {
    const keys = buildCodeSessionTimeline(
      thread({
        activeTurnId: 't2',
        partialResponse: 'so far',
        messages: [
          { role: 'user', text: 'ask', turnId: 't1' },
          { role: 'assistant', text: 'answer', turnId: 't1' },
          { role: 'user', text: 'next', turnId: 't2' },
        ],
        tools: [tool('a', 't1'), tool('b', 't2'), tool('c', null)],
        thinking: [
          { turnId: 't1', text: 'one' },
          { turnId: 't2', text: 'two' },
        ],
        queuedGuidance: ['later', 'later'],
      }),
    ).map((item) => item.key);

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('labels and counts', () => {
  it('names the step that is running, else how many ran', () => {
    expect(codeWorkLabel([tool('a', 't1')])).toBe('Ran 1 step');
    expect(codeWorkLabel([tool('a', 't1'), tool('b', 't1')])).toBe('Ran 2 steps');
    expect(codeWorkLabel([tool('a', 't1', 'running')])).toBe('Running run a');
    expect(codeWorkLabel([tool('a', 't1'), tool('b', 't1', 'running')])).toBe(
      'Running run b · 1 done',
    );
  });

  it('counts running tasks from the larger of running steps and sub-tasks', () => {
    expect(codeWorkingLabel(thread())).toBe('Working');
    expect(codeWorkingLabel(thread({ runningTasks: 1 }))).toBe('Working');
    expect(codeWorkingLabel(thread({ runningTasks: 4 }))).toBe('Working · 4 running tasks');
    expect(
      codeWorkingLabel(
        thread({ runningTasks: 1, tools: [tool('a', 't', 'running'), tool('b', 't', 'running')] }),
      ),
    ).toBe('Working · 2 running tasks');
  });

  it('counts added and removed lines without the file headers, and files once', () => {
    const diffs = [
      {
        path: 'a.ts',
        patch: '--- a/a.ts\n+++ b/a.ts\n@@ -1 +1,2 @@\n-3\n+5\n+6',
        truncated: false,
      },
    ];
    expect(countDiffLines(diffs)).toEqual({ added: 2, removed: 1 });
    expect(
      codeChangedFileCount(
        thread({
          diffs,
          fileChanges: [
            { path: 'a.ts', kind: 'modified', tool: 'edit', changedAt: '' },
            { path: 'b.ts', kind: 'created', tool: 'write', changedAt: '' },
          ],
        }),
      ),
    ).toBe(2);
  });
});

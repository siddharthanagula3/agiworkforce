import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DesktopRuntimeError,
  DEVELOPER_SESSION_MAX_FRAME_BYTES,
  type LocalDeveloperSession,
  type DeveloperSessionEvent,
} from '@agiworkforce/local-runtime-contract';

const readDeveloperSession = vi.fn();
const startDeveloperTurn = vi.fn();
const interruptDeveloperTurn = vi.fn();
const answerDeveloperApproval = vi.fn();
const steerDeveloperTurn = vi.fn();
const answerDeveloperUserInput = vi.fn();
const takeOverDeveloperThread = vi.fn();
let emit: ((rootId: string, event: DeveloperSessionEvent) => void) | null = null;

vi.mock('@/features/desktop-host', () => ({
  readDeveloperSession,
  startDeveloperTurn,
  takeOverDeveloperThread,
  interruptDeveloperTurn,
  answerDeveloperApproval,
  steerDeveloperTurn,
  answerDeveloperUserInput,
  onDeveloperSessionEvent: (listener: (rootId: string, event: DeveloperSessionEvent) => void) => {
    emit = listener;
    return () => {
      emit = null;
    };
  },
}));

const { useLocalSession } = await import('./use-local-session');
const { forgetLocalSession } = await import('../local-session-memory');

const session: LocalDeveloperSession = {
  id: 'thread-1',
  rootId: 'root-1',
  title: 'Quote the readme',
  cwd: '/work/qa-project',
  model: 'a-model',
  provider: 'a-provider',
  trustMode: 'byok',
  status: 'idle',
  createdAt: '2026-09-14T11:00:00Z',
  updatedAt: '2026-09-14T11:05:00Z',
  origin: 'desktop',
};

function send(event: DeveloperSessionEvent, rootId = 'root-1') {
  act(() => emit?.(rootId, event));
}

beforeEach(() => {
  vi.clearAllMocks();
  forgetLocalSession('root-1', 'thread-1');
  readDeveloperSession.mockResolvedValue({
    session,
    messages: [],
    truncated: false,
    activeTurn: null,
  });
  startDeveloperTurn.mockResolvedValue({ turnId: 'turn-1' });
  interruptDeveloperTurn.mockResolvedValue(true);
  answerDeveloperApproval.mockResolvedValue(true);
  steerDeveloperTurn.mockResolvedValue({ turnId: 'turn-1' });
  answerDeveloperUserInput.mockResolvedValue(true);
});

const APPROVAL = {
  type: 'approval-requested',
  threadId: 'thread-1',
  turnId: 'turn-1',
  requestId: 'ask-1',
  kind: 'Exec',
  summary: 'Run pnpm build',
  detail: 'pnpm build',
  command: 'pnpm build --filter web',
  riskLevel: 'medium',
  reversible: false,
} as const satisfies DeveloperSessionEvent;

async function startRunning(result: { current: { send: (text: string) => Promise<unknown> } }) {
  await act(async () => {
    await result.current.send('long job');
  });
  send({ type: 'turn-started', threadId: 'thread-1', turnId: 'turn-1' });
}

function finish(outcome: 'completed' | 'failed' | 'interrupted') {
  send({
    type: 'turn-finished',
    threadId: 'thread-1',
    turnId: 'turn-1',
    outcome,
    response: '',
    failure: null,
    inputTokens: 0,
    outputTokens: 0,
  });
}

describe('one local session', () => {
  it('streams a reply and folds a completed turn back into the transcript', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    await act(async () => {
      await result.current.send('Reply with exactly: desktop leg ok');
    });
    send({ type: 'output-delta', threadId: 'thread-1', turnId: 'turn-1', delta: 'desktop ' });
    send({ type: 'output-delta', threadId: 'thread-1', turnId: 'turn-1', delta: 'leg ok' });
    expect(result.current.turn.reply).toBe('desktop leg ok');

    readDeveloperSession.mockResolvedValue({
      session,
      messages: [
        { role: 'user', text: 'Reply with exactly: desktop leg ok' },
        { role: 'assistant', text: 'desktop leg ok' },
      ],
      truncated: false,
    });
    send({
      type: 'turn-finished',
      threadId: 'thread-1',
      turnId: 'turn-1',
      outcome: 'completed',
      response: 'desktop leg ok',
      failure: null,
      inputTokens: 0,
      outputTokens: 0,
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.turn.reply).toBe('');
    expect(result.current.turn.outcome).toBeNull();
  });

  it('keeps a failed turn on screen instead of clearing it away', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    await act(async () => {
      await result.current.send('ping');
    });
    send({
      type: 'turn-finished',
      threadId: 'thread-1',
      turnId: 'turn-1',
      outcome: 'failed',
      response: '',
      failure: {
        code: 'provider_auth_missing',
        message: '[a-provider] Authentication failed.',
        provider: 'a-provider',
        action: 'sign_in_provider',
        retryable: false,
      },
      inputTokens: 0,
      outputTokens: 0,
    });

    await waitFor(() => expect(result.current.turn.outcome).toBe('failed'));
    expect(result.current.turn.failure?.code).toBe('provider_auth_missing');
    expect(result.current.turn.prompt).toBe('ping');
    expect(readDeveloperSession).toHaveBeenCalledTimes(1);
  });

  it('keeps an interrupted turn and the reply it produced', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    await act(async () => {
      await result.current.send('long job');
    });
    send({ type: 'output-delta', threadId: 'thread-1', turnId: 'turn-1', delta: 'half a ' });
    await act(async () => {
      await result.current.stop();
    });
    send({
      type: 'turn-finished',
      threadId: 'thread-1',
      turnId: 'turn-1',
      outcome: 'interrupted',
      response: '',
      failure: null,
      inputTokens: 0,
      outputTokens: 0,
    });

    expect(interruptDeveloperTurn).toHaveBeenCalledWith('root-1', 'thread-1', 'turn-1');
    await waitFor(() => expect(result.current.turn.outcome).toBe('interrupted'));
    expect(result.current.turn.reply).toBe('half a ');
  });

  it('ends the turn when the host fails to interrupt it, so Stop is not stuck', async () => {
    interruptDeveloperTurn.mockRejectedValue(new Error('The host could not stop the turn.'));
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    await act(async () => {
      await result.current.send('long job');
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.turn.outcome).toBe('interrupted');
    expect(result.current.error).not.toBeNull();
  });

  it('keeps the context the last turn used, and names the step bound on the next turn', async () => {
    const { result } = renderHook(() => useLocalSession(session, { maxTurns: 25 }));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    await act(async () => {
      await result.current.send('long job');
    });
    expect(startDeveloperTurn).toHaveBeenCalledWith(expect.objectContaining({ maxTurns: 25 }));

    send({
      type: 'turn-finished',
      threadId: 'thread-1',
      turnId: 'turn-1',
      outcome: 'failed',
      response: '',
      failure: null,
      inputTokens: 1200,
      outputTokens: 300,
    });

    expect(result.current.contextTokens).toBe(1500);
  });

  it('carries an approval through and clears it once answered', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    send(APPROVAL);
    expect(result.current.approvals).toEqual([
      {
        turnId: 'turn-1',
        requestId: 'ask-1',
        kind: 'Exec',
        summary: 'Run pnpm build',
        detail: 'pnpm build',
        command: 'pnpm build --filter web',
        riskLevel: 'medium',
        reversible: false,
      },
    ]);

    await act(async () => {
      await result.current.decideApproval(result.current.approvals[0]!, 'approve_for_session');
    });
    expect(answerDeveloperApproval).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'ask-1',
      decision: 'approve_for_session',
    });

    send({
      type: 'approval-answered',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'ask-1',
      decision: 'approve_for_session',
      approved: true,
    });
    expect(result.current.approvals).toEqual([]);
  });

  it('sends the rule the CLI proposed with an always-allow decision', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    send({ ...APPROVAL, proposedCommandPrefix: ['pnpm', 'build'] });
    await act(async () => {
      await result.current.decideApproval(result.current.approvals[0]!, 'always_allow_command');
    });

    expect(answerDeveloperApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'always_allow_command',
        commandPrefix: ['pnpm', 'build'],
      }),
    );
  });

  it('keeps every pending approval, not only the latest', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    send(APPROVAL);
    send({ ...APPROVAL, requestId: 'ask-2' });
    send(APPROVAL);

    expect(result.current.approvals.map((approval) => approval.requestId)).toEqual([
      'ask-1',
      'ask-2',
    ]);
  });

  it('starts a turn with the posture, effort, files and images chosen for it', async () => {
    const { result } = renderHook(() =>
      useLocalSession(session, { agentMode: 'plan', reasoningEffort: 'low' }),
    );
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    await act(async () => {
      await result.current.send({
        text: 'look',
        images: ['data:image/png;base64,AAAA'],
        contextFiles: ['src/a.ts'],
      });
    });

    expect(startDeveloperTurn).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      text: 'look',
      agentMode: 'plan',
      reasoningEffort: 'low',
      contextFiles: ['src/a.ts'],
      images: ['data:image/png;base64,AAAA'],
    });
  });

  it('steers a message into the running turn and shows it there', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    await startRunning(result);

    await act(async () => {
      await result.current.steer({ text: 'use the other file', images: [], contextFiles: [] });
    });

    expect(steerDeveloperTurn).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      text: 'use the other file',
    });
    expect(result.current.turn.steered).toEqual(['use the other file']);
    expect(result.current.queued).toEqual([]);
  });

  it('queues a steer the running turn refuses instead of dropping it', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    await startRunning(result);
    steerDeveloperTurn.mockRejectedValueOnce(new Error('No running turn exists for this thread'));

    await act(async () => {
      await result.current.steer({ text: 'and this', images: [], contextFiles: [] });
    });

    expect(result.current.queued.map((item) => item.text)).toEqual(['and this']);
    expect(result.current.notice).toContain('queued instead');
  });

  it('sends the next queued message once the turn completes', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    await startRunning(result);

    act(() => {
      result.current.enqueue({ text: 'first', images: [], contextFiles: [] });
      result.current.enqueue({ text: 'second', images: [], contextFiles: [] });
    });
    const [first] = result.current.queued;
    act(() => result.current.updateQueued(first!.id, 'first, edited'));
    startDeveloperTurn.mockClear();
    finish('completed');

    await waitFor(() =>
      expect(startDeveloperTurn).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'first, edited' }),
      ),
    );
    expect(result.current.queued.map((item) => item.text)).toEqual(['second']);
  });

  it('holds the queue when a turn is stopped, until the reader sends one', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    await startRunning(result);
    act(() => result.current.enqueue({ text: 'later', images: [], contextFiles: [] }));
    startDeveloperTurn.mockClear();

    finish('interrupted');

    await waitFor(() => expect(result.current.queuePaused).toBe(true));
    expect(startDeveloperTurn).not.toHaveBeenCalled();
    const [item] = result.current.queued;
    await act(async () => {
      await result.current.sendQueuedNow(item!.id);
    });
    expect(startDeveloperTurn).toHaveBeenCalledWith(expect.objectContaining({ text: 'later' }));
    expect(result.current.queued).toEqual([]);
  });

  it('holds a question the agent asked until it is answered, and sends a skip as no answer', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    const asked = {
      type: 'user-input-requested',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'q-1',
      question: 'Which branch?',
    } as const;

    send(asked);
    send({ ...asked, requestId: 'q-2', question: 'Which file?' });
    expect(result.current.questions.map((question) => question.requestId)).toEqual(['q-1', 'q-2']);

    await act(async () => {
      await result.current.answerQuestion(result.current.questions[0]!, 'main');
      await result.current.answerQuestion(result.current.questions[1]!, null);
    });
    expect(answerDeveloperUserInput.mock.calls).toEqual([
      [
        {
          rootId: 'root-1',
          threadId: 'thread-1',
          turnId: 'turn-1',
          requestId: 'q-1',
          answer: 'main',
        },
      ],
      [
        {
          rootId: 'root-1',
          threadId: 'thread-1',
          turnId: 'turn-1',
          requestId: 'q-2',
          answer: null,
        },
      ],
    ]);

    send({
      type: 'user-input-answered',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'q-1',
      cancelled: false,
    });
    expect(result.current.questions.map((question) => question.requestId)).toEqual(['q-2']);
    finish('interrupted');
    expect(result.current.questions).toEqual([]);
  });

  it('picks up a turn already running when opened, with what it waits on', async () => {
    readDeveloperSession.mockResolvedValue({
      session,
      messages: [],
      truncated: false,
      activeTurn: {
        turnId: 'turn-live',
        partialResponse: 'half an answer',
        approvals: [
          {
            requestId: 'ask-1',
            kind: 'Exec',
            summary: 'Run tests',
            detail: '',
            command: 'cargo test',
            riskLevel: 'medium',
            reversible: true,
          },
        ],
        questions: [{ requestId: 'q-1', question: 'Which branch?' }],
      },
    });

    const { result } = renderHook(() => useLocalSession(session));

    await waitFor(() => expect(result.current.questions).toHaveLength(1));
    expect(result.current.turn).toMatchObject({ turnId: 'turn-live', reply: 'half an answer' });
    expect(result.current.approvals[0]).toMatchObject({ requestId: 'ask-1', turnId: 'turn-live' });
    expect(result.current.questions[0]).toEqual({
      requestId: 'q-1',
      question: 'Which branch?',
      turnId: 'turn-live',
    });
  });

  it('puts steers a stopped turn never read back at the head of the queue', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    await startRunning(result);
    await act(async () => {
      await result.current.steer({ text: 'read', images: [], contextFiles: [] });
      await result.current.steer({
        text: 'unread',
        images: ['data:image/png;base64,AA=='],
        contextFiles: [],
      });
    });
    act(() => result.current.enqueue({ text: 'next turn', images: [], contextFiles: [] }));

    send({
      type: 'turn-finished',
      threadId: 'thread-1',
      turnId: 'turn-1',
      outcome: 'interrupted',
      response: '',
      failure: null,
      inputTokens: 0,
      outputTokens: 0,
      unsentSteers: 1,
    });

    await waitFor(() => expect(result.current.queuePaused).toBe(true));
    expect(result.current.queued.map((item) => item.text)).toEqual(['unread', 'next turn']);
    expect(result.current.queued[0]?.images).toEqual(['data:image/png;base64,AA==']);
    expect(result.current.turn.steered).toEqual(['read']);
    expect(result.current.notice).toContain('back in the queue');
  });

  it('takes queued text back into the composer ahead of the draft, and leaves pictures queued', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    act(() => {
      result.current.enqueue({ text: 'first', images: [], contextFiles: ['src/a.ts'] });
      result.current.enqueue({ text: 'second', images: [], contextFiles: [] });
    });
    let recalled: ReturnType<typeof result.current.recallQueued> = null;
    act(() => {
      recalled = result.current.recallQueued('');
    });
    expect(recalled).toEqual({ text: 'first\nsecond', contextFiles: ['src/a.ts'] });
    expect(result.current.queued).toEqual([]);

    act(() =>
      result.current.enqueue({
        text: 'picture',
        images: ['data:image/png;base64,AA=='],
        contextFiles: [],
      }),
    );
    act(() => {
      recalled = result.current.recallQueued('');
    });
    expect(recalled).toBeNull();
    expect(result.current.queued.map((item) => item.text)).toEqual(['picture']);
  });

  it('ignores a slow read of the session that was open before this one', async () => {
    let answerFirst: (value: unknown) => void = () => undefined;
    readDeveloperSession.mockReset();
    readDeveloperSession
      .mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)))
      .mockResolvedValueOnce({
        session,
        messages: [{ role: 'user', text: 'second session' }],
        truncated: false,
        activeTurn: null,
      });
    const { result, rerender } = renderHook(({ open }) => useLocalSession(open), {
      initialProps: { open: session },
    });

    rerender({ open: { ...session, id: 'thread-2' } });
    await waitFor(() =>
      expect(result.current.messages.map((m) => m.text)).toEqual(['second session']),
    );
    await act(async () => {
      answerFirst({
        session,
        messages: [{ role: 'user', text: 'first session' }],
        truncated: false,
        activeTurn: null,
      });
    });

    expect(result.current.messages.map((m) => m.text)).toEqual(['second session']);
    expect(result.current.loading).toBe(false);
  });

  it('queues a follow-up that carries folder files instead of steering without them', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    await startRunning(result);

    await act(async () => {
      await result.current.steer({ text: 'use this', images: [], contextFiles: ['src/a.ts'] });
    });

    expect(steerDeveloperTurn).not.toHaveBeenCalled();
    expect(result.current.queued).toMatchObject([{ text: 'use this', contextFiles: ['src/a.ts'] }]);
    expect(result.current.notice).toContain('queued for the next turn');
  });

  it('keeps a message whose turn could not start, at the head of a paused queue', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    act(() => result.current.enqueue({ text: 'already waiting', images: [], contextFiles: [] }));
    startDeveloperTurn.mockRejectedValueOnce(new Error('the runtime refused'));

    await act(async () => {
      await result.current.send({
        text: 'do not lose me',
        images: ['data:image/png;base64,AA=='],
        contextFiles: ['src/a.ts'],
      });
    });

    expect(result.current.queued).toMatchObject([
      {
        text: 'do not lose me',
        images: ['data:image/png;base64,AA=='],
        contextFiles: ['src/a.ts'],
      },
      { text: 'already waiting' },
    ]);
    expect(result.current.queuePaused).toBe(true);
    expect(result.current.error).not.toBeNull();
    expect(result.current.notice).toContain('head of the queue');
  });

  it('holds a message another program is blocking, then sends it once the session is taken over', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    startDeveloperTurn.mockRejectedValueOnce(
      new DesktopRuntimeError({
        code: 'thread-held',
        message: 'agi (pid 4242) is writing this session.',
      }),
    );
    takeOverDeveloperThread.mockResolvedValue(session);

    await act(async () => {
      await result.current.send('carry on');
    });

    expect(result.current.heldBy).toBe('agi (pid 4242) is writing this session.');
    expect(result.current.error).toBeNull();
    expect(result.current.queued).toMatchObject([{ text: 'carry on' }]);
    expect(result.current.queuePaused).toBe(true);

    await act(async () => {
      await result.current.takeOver();
    });

    expect(takeOverDeveloperThread).toHaveBeenCalledWith('root-1', 'thread-1');
    await waitFor(() => expect(startDeveloperTurn).toHaveBeenCalledTimes(2));
    expect(startDeveloperTurn).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: 'carry on' }),
    );
    expect(result.current.heldBy).toBeNull();
    expect(result.current.queued).toEqual([]);
  });

  it('keeps the message waiting and says so when the takeover is refused', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    startDeveloperTurn.mockRejectedValueOnce(
      new DesktopRuntimeError({ code: 'thread-held', message: 'agi is writing this session.' }),
    );
    takeOverDeveloperThread.mockRejectedValue(new Error('refused'));

    await act(async () => {
      await result.current.send('carry on');
    });
    await act(async () => {
      await result.current.takeOver();
    });

    expect(result.current.heldBy).toBe('agi is writing this session.');
    expect(result.current.error).not.toBeNull();
    expect(result.current.queued).toMatchObject([{ text: 'carry on' }]);
    expect(startDeveloperTurn).toHaveBeenCalledTimes(1);
  });

  it('keeps queued follow-ups and a held message when the session is closed and opened again', async () => {
    const first = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    startDeveloperTurn.mockRejectedValueOnce(new Error('the runtime refused'));
    await act(async () => {
      await first.result.current.send('held back');
    });
    act(() => first.result.current.enqueue({ text: 'then this', images: [], contextFiles: [] }));
    first.unmount();

    const reopened = renderHook(() => useLocalSession(session));

    await waitFor(() =>
      expect(reopened.result.current.queued).toMatchObject([
        { text: 'held back' },
        { text: 'then this' },
      ]),
    );
    await waitFor(() => expect(reopened.result.current.queuePaused).toBe(true));
    expect(startDeveloperTurn).toHaveBeenCalledTimes(1);
  });

  it('holds follow-ups kept from an earlier visit when no turn is running to send them', async () => {
    const first = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    await act(async () => {
      await first.result.current.send('long job');
    });
    send({ type: 'turn-started', threadId: 'thread-1', turnId: 'turn-1' });
    act(() => first.result.current.enqueue({ text: 'after that', images: [], contextFiles: [] }));
    expect(first.result.current.queuePaused).toBe(false);
    first.unmount();

    const reopened = renderHook(() => useLocalSession(session));

    await waitFor(() => expect(reopened.result.current.queuePaused).toBe(true));
    expect(reopened.result.current.queued).toMatchObject([{ text: 'after that' }]);
  });

  it('keeps another session and a deleted one clear of what was queued here', async () => {
    const first = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    act(() => first.result.current.enqueue({ text: 'mine', images: [], contextFiles: [] }));
    first.unmount();

    const other = renderHook(() => useLocalSession({ ...session, id: 'thread-2' }));
    expect(other.result.current.queued).toEqual([]);
    other.unmount();

    forgetLocalSession('root-1', 'thread-1');
    const afterDelete = renderHook(() => useLocalSession(session));
    expect(afterDelete.result.current.queued).toEqual([]);
  });

  it('queues a second send made while the first is still starting, and keeps the live turn', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    let started: (value: { turnId: string }) => void = () => undefined;
    startDeveloperTurn.mockReturnValueOnce(
      new Promise((resolve) => {
        started = resolve;
      }),
    );

    let first: Promise<unknown> = Promise.resolve();
    let second = '';
    await act(async () => {
      first = result.current.send('once');
      second = await result.current.send('once');
    });
    await act(async () => {
      started({ turnId: 'turn-1' });
      await first;
    });

    expect(second).toBe('held');
    expect(startDeveloperTurn).toHaveBeenCalledTimes(1);
    expect(result.current.turn.turnId).toBe('turn-1');
    expect(result.current.queued).toMatchObject([{ text: 'once' }]);

    await act(async () => {
      await result.current.send('while it runs');
    });
    expect(startDeveloperTurn).toHaveBeenCalledTimes(1);
    expect(result.current.turn.turnId).toBe('turn-1');
  });

  it('neither sends nor queues a message when bypass is declined in the shell', async () => {
    const { result } = renderHook(() => useLocalSession(session, { agentMode: 'bypass' }));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    startDeveloperTurn.mockRejectedValueOnce(
      new DesktopRuntimeError({ code: 'cancelled', message: 'The turn was not sent.' }),
    );

    let outcome = '';
    await act(async () => {
      outcome = await result.current.send('wipe it');
    });

    expect(outcome).toBe('declined');
    expect(result.current.bypassDeclines).toBe(1);
    expect(result.current.queued).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.queuePaused).toBe(false);
  });

  it('keeps a queued message in the queue when bypass is declined for it', async () => {
    const { result } = renderHook(() => useLocalSession(session, { agentMode: 'bypass' }));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    act(() => result.current.enqueue({ text: 'queued earlier', images: [], contextFiles: [] }));
    startDeveloperTurn.mockRejectedValueOnce(
      new DesktopRuntimeError({ code: 'cancelled', message: 'The turn was not sent.' }),
    );

    await act(async () => {
      await result.current.sendQueuedNow(result.current.queued[0]!.id);
    });

    expect(result.current.queued).toMatchObject([{ text: 'queued earlier' }]);
    expect(result.current.queuePaused).toBe(true);
    expect(result.current.bypassDeclines).toBe(1);
  });

  it('leaves a turn started during the reload alone, and holds the queue for it', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    await startRunning(result);
    act(() => result.current.enqueue({ text: 'queued', images: [], contextFiles: [] }));
    let finishReload: (value: unknown) => void = () => undefined;
    readDeveloperSession.mockImplementationOnce(
      () => new Promise((resolve) => (finishReload = resolve)),
    );
    startDeveloperTurn.mockClear();
    startDeveloperTurn.mockResolvedValueOnce({ turnId: 'turn-2' });

    finish('completed');
    await act(async () => {
      await result.current.send('started while reloading');
    });
    await act(async () => {
      finishReload({ session, messages: [], truncated: false, activeTurn: null });
    });

    expect(result.current.turn).toMatchObject({
      turnId: 'turn-2',
      prompt: 'started while reloading',
    });
    expect(startDeveloperTurn).toHaveBeenCalledTimes(1);
    expect(result.current.queued.map((item) => item.text)).toEqual(['queued']);
  });

  it('removes a queued message the reader no longer wants', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    act(() => result.current.enqueue({ text: 'drop me', images: [], contextFiles: [] }));
    act(() => result.current.removeQueued(result.current.queued[0]!.id));

    expect(result.current.queued).toEqual([]);
  });

  it('answers a question the agent asked with the option the user chose', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    send({
      ...APPROVAL,
      requestId: 'ask-2',
      summary: 'The agent has a question',
      detail: '',
      command: null,
      riskLevel: null,
      reversible: null,
      question: { question: 'Which suite?', options: ['unit', 'e2e'] },
    });
    expect(result.current.approvals[0]?.question?.options).toEqual(['unit', 'e2e']);

    await act(async () => {
      await result.current.decideApproval(result.current.approvals[0]!, 'approve_once', 'e2e');
    });
    expect(answerDeveloperApproval).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'ask-2', decision: 'approve_once', note: 'e2e' }),
    );
  });

  it('ignores a turn that belongs to another session in the same folder', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    send({ type: 'output-delta', threadId: 'other-thread', turnId: 'turn-9', delta: 'not mine' });

    expect(result.current.turn.reply).toBe('');
  });

  it('says so when the runtime under the session stops', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    send({ type: 'runtime-stopped', message: 'The AGI CLI exited (1)' });

    expect(result.current.error).toBe('The local runtime stopped.');
  });
});

describe('cursor-owned reconnect replay', () => {
  function transcript(partialResponse: string, nextDeltaIndex: number, turnId = 'turn-1') {
    return {
      session,
      messages: [],
      truncated: false,
      activeTurn: {
        turnId,
        partialResponse,
        nextDeltaIndex,
        nextEventSequence: 0,
        approvals: [],
        questions: [],
      },
    };
  }

  it('buffers live overlap until the snapshot and renders every indexed delta once', async () => {
    let resolveRead!: (value: unknown) => void;
    readDeveloperSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalledTimes(1));
    send({ type: 'turn-started', threadId: session.id, turnId: 'turn-1' });
    send({
      type: 'output-delta',
      threadId: session.id,
      turnId: 'turn-1',
      index: 0,
      delta: 'hello',
    });
    send({
      type: 'output-delta',
      threadId: session.id,
      turnId: 'turn-1',
      index: 1,
      delta: ' world',
    });
    await act(async () => resolveRead(transcript('hello', 1)));
    expect(result.current.turn.reply).toBe('hello world');
    send({
      type: 'output-delta',
      threadId: session.id,
      turnId: 'turn-1',
      index: 1,
      delta: ' world',
    });
    expect(result.current.turn.reply).toBe('hello world');
  });

  it('refreshes a missing delta from a snapshot instead of appending over the gap', async () => {
    readDeveloperSession.mockResolvedValueOnce(transcript('a', 1));
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(result.current.turn.reply).toBe('a'));
    readDeveloperSession.mockResolvedValueOnce(transcript('abc', 3));
    send({ type: 'output-delta', threadId: session.id, turnId: 'turn-1', index: 2, delta: 'c' });
    await waitFor(() => expect(result.current.turn.reply).toBe('abc'));
    expect(readDeveloperSession).toHaveBeenCalledTimes(2);
  });

  it('ignores late output and approvals belonging to a replaced turn', async () => {
    readDeveloperSession.mockResolvedValueOnce(transcript('old', 1));
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(result.current.turn.reply).toBe('old'));
    send({ type: 'turn-started', threadId: session.id, turnId: 'turn-2' });
    send({ type: 'output-delta', threadId: session.id, turnId: 'turn-2', index: 0, delta: 'new' });
    send({ ...APPROVAL, turnId: 'turn-1' });
    send({
      type: 'output-delta',
      threadId: session.id,
      turnId: 'turn-1',
      index: 1,
      delta: ' stale',
    });
    expect(result.current.turn).toMatchObject({ turnId: 'turn-2', reply: 'new' });
    expect(result.current.approvals).toEqual([]);
  });

  it('keeps a new live turn when an older snapshot resolves during replacement', async () => {
    let resolveRead!: (value: unknown) => void;
    readDeveloperSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    send({ type: 'turn-started', threadId: session.id, turnId: 'turn-2' });
    send({ type: 'output-delta', threadId: session.id, turnId: 'turn-2', index: 0, delta: 'new' });
    await act(async () => resolveRead(transcript('old', 1)));
    expect(result.current.turn).toMatchObject({ turnId: 'turn-2', reply: 'new' });
  });

  it('uses reconnect cursors after remount and preserves pending approval ownership', async () => {
    const snapshot = transcript('hello', 1);
    const { type: _type, threadId: _threadId, turnId: _turnId, ...approval } = APPROVAL;
    readDeveloperSession.mockResolvedValue({
      ...snapshot,
      activeTurn: { ...snapshot.activeTurn, approvals: [approval] },
    });
    const first = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(first.result.current.turn.reply).toBe('hello'));
    first.unmount();
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(result.current.turn.reply).toBe('hello'));
    send({
      type: 'output-delta',
      threadId: session.id,
      turnId: 'turn-1',
      index: 0,
      delta: 'hello',
    });
    send({
      type: 'output-delta',
      threadId: session.id,
      turnId: 'turn-1',
      index: 1,
      delta: ' world',
    });
    expect(result.current.turn.reply).toBe('hello world');
    expect(result.current.approvals[0]).toMatchObject({ turnId: 'turn-1', requestId: 'ask-1' });
  });

  it('uses the authoritative terminal response when a stream ended before all deltas arrived', async () => {
    readDeveloperSession.mockResolvedValueOnce(transcript('half', 1));
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(result.current.turn.reply).toBe('half'));
    send({
      type: 'turn-finished',
      threadId: session.id,
      turnId: 'turn-1',
      outcome: 'interrupted',
      response: 'half plus final',
      failure: null,
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(result.current.turn.reply).toBe('half plus final');
    send({ ...APPROVAL, turnId: 'turn-old' });
    expect(result.current.approvals).toEqual([]);
  });
  it('does not append a late delta after a buffered terminal event', async () => {
    let resolveRead!: (value: unknown) => void;
    readDeveloperSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    send({ type: 'turn-started', threadId: session.id, turnId: 'turn-1' });
    send({ type: 'output-delta', threadId: session.id, turnId: 'turn-1', index: 0, delta: 'a' });
    send({
      type: 'turn-finished',
      threadId: session.id,
      turnId: 'turn-1',
      outcome: 'interrupted',
      response: 'ab',
      failure: null,
      inputTokens: 0,
      outputTokens: 0,
    });
    send({
      type: 'output-delta',
      threadId: session.id,
      turnId: 'turn-1',
      index: 1,
      delta: 'stale',
    });
    await act(async () => resolveRead(transcript('', 0)));
    expect(result.current.turn).toMatchObject({ reply: 'ab', outcome: 'interrupted' });
  });

  it('invalidates an outstanding snapshot when its runtime stops', async () => {
    let resolveRead!: (value: unknown) => void;
    readDeveloperSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    send({ type: 'runtime-stopped', message: 'owned host stopped' });
    await act(async () => resolveRead(transcript('stale partial', 1)));
    expect(result.current.turn.reply).toBe('');
    expect(result.current.approvals).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('keeps completed output and queued input when transcript recovery fails', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());
    await startRunning(result);
    act(() => result.current.enqueue({ text: 'keep queued', images: [], contextFiles: [] }));
    readDeveloperSession.mockRejectedValueOnce(new Error('read failed'));
    send({
      type: 'turn-finished',
      threadId: session.id,
      turnId: 'turn-1',
      outcome: 'completed',
      response: 'complete result',
      failure: null,
      inputTokens: 0,
      outputTokens: 0,
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.turn.reply).toBe('complete result');
    expect(result.current.queued.map((item) => item.text)).toEqual(['keep queued']);
  });

  it('bounds buffered event bytes and obtains a fresh snapshot after overflow', async () => {
    let resolveRead!: (value: unknown) => void;
    readDeveloperSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    readDeveloperSession.mockResolvedValueOnce(transcript('recovered', 1));
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalledTimes(1));
    send({
      type: 'output-delta',
      threadId: session.id,
      turnId: 'turn-1',
      index: 0,
      delta: 'x'.repeat(DEVELOPER_SESSION_MAX_FRAME_BYTES),
    });
    expect(readDeveloperSession).toHaveBeenCalledTimes(1);
    await act(async () => resolveRead(transcript('', 0)));
    await waitFor(() => expect(result.current.turn.reply).toBe('recovered'));
    expect(readDeveloperSession).toHaveBeenCalledTimes(2);
    expect(result.current.notice).toMatch(/read again/);
  });

  it('reconciles a missed terminal event with the matching stored assistant turn', async () => {
    readDeveloperSession.mockResolvedValueOnce(transcript('partial', 1));
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(result.current.turn.reply).toBe('partial'));
    readDeveloperSession.mockResolvedValueOnce({
      session,
      truncated: false,
      activeTurn: null,
      messages: [{ role: 'assistant', text: 'complete', turnId: 'turn-1' }],
    });
    await act(async () => result.current.reload());
    expect(result.current.messages).toEqual([
      { role: 'assistant', text: 'complete', turnId: 'turn-1' },
    ]);
    expect(result.current.turn.reply).toBe('');
  });
});

it('loads persisted child task identity and clears it when switching parent sessions', async () => {
  const child = {
    id: 'subagent_owned',
    title: 'Owned child',
    parentSessionId: session.id,
    state: 'paused',
  };
  readDeveloperSession.mockResolvedValueOnce({
    session,
    messages: [],
    truncated: false,
    activeTurn: null,
    childTasks: [child],
  });
  const { result, rerender } = renderHook(({ current }) => useLocalSession(current), {
    initialProps: { current: session },
  });
  await waitFor(() => expect(result.current.childTasks).toEqual([child]));
  rerender({ current: { ...session, id: 'another-parent' } });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.childTasks).toEqual([]);
});

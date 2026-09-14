import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LocalDeveloperSession,
  DeveloperSessionEvent,
} from '@agiworkforce/local-runtime-contract';

const readDeveloperSession = vi.fn();
const startDeveloperTurn = vi.fn();
const interruptDeveloperTurn = vi.fn();
const answerDeveloperApproval = vi.fn();
let emit: ((rootId: string, event: DeveloperSessionEvent) => void) | null = null;

vi.mock('@/features/desktop-host', () => ({
  readDeveloperSession,
  startDeveloperTurn,
  interruptDeveloperTurn,
  answerDeveloperApproval,
  onDeveloperSessionEvent: (listener: (rootId: string, event: DeveloperSessionEvent) => void) => {
    emit = listener;
    return () => {
      emit = null;
    };
  },
}));

const { useLocalSession } = await import('./use-local-session');

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
  readDeveloperSession.mockResolvedValue({ session, messages: [], truncated: false });
  startDeveloperTurn.mockResolvedValue({ turnId: 'turn-1' });
  interruptDeveloperTurn.mockResolvedValue(true);
  answerDeveloperApproval.mockResolvedValue(true);
});

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
      error: null,
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
      error: '[a-provider] Authentication failed.',
    });

    await waitFor(() => expect(result.current.turn.outcome).toBe('failed'));
    expect(result.current.turn.error).toBe('[a-provider] Authentication failed.');
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
      error: null,
    });

    expect(interruptDeveloperTurn).toHaveBeenCalledWith('root-1', 'thread-1', 'turn-1');
    await waitFor(() => expect(result.current.turn.outcome).toBe('interrupted'));
    expect(result.current.turn.reply).toBe('half a ');
  });

  it('carries an approval through and clears it once answered', async () => {
    const { result } = renderHook(() => useLocalSession(session));
    await waitFor(() => expect(readDeveloperSession).toHaveBeenCalled());

    send({
      type: 'approval-requested',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'ask-1',
      summary: 'Run pnpm build',
      detail: 'pnpm build',
    });
    expect(result.current.approval).toMatchObject({ requestId: 'ask-1' });

    await act(async () => {
      await result.current.decideApproval(true);
    });
    expect(answerDeveloperApproval).toHaveBeenCalledWith({
      rootId: 'root-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'ask-1',
      approved: true,
    });

    send({
      type: 'approval-answered',
      threadId: 'thread-1',
      turnId: 'turn-1',
      requestId: 'ask-1',
      approved: true,
    });
    expect(result.current.approval).toBeNull();
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

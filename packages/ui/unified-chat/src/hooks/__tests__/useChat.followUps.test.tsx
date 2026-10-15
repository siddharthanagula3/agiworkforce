import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChat } from '../useChat';
import { useChatStore } from '../../stores/chatStore';
import { useFollowUpStore, resolveFollowUpState } from '../../queue/followUps';
import { useSettingsStore } from '../../stores/settingsStore';
import { useModelStore } from '../../stores/modelStore';
import { useTierStore } from '../../stores/tierStore';
import { getModelMetadataById, listCanonicalModels } from '@agiworkforce/types';
import type { ModelInfo } from '../../lib/types';
import { useTurnTodoStore } from '../../components/TurnTodoPanel';
import { useAgentQuestionStore } from '../../components/AgentQuestionCard';
import { useTurnNoticeStore } from '../../components/TurnNotices';
import { SteerRefusedError } from '../../lib/runtime';
import type { ChatRuntime, StreamCallback } from '../../lib/runtime';

function makeRuntime(overrides: Partial<ChatRuntime> = {}) {
  let callback: StreamCallback | null = null;
  const runtime: ChatRuntime = {
    sendMessage: vi.fn(async () => {}),
    stopGeneration: vi.fn(),
    createConversation: vi.fn(async () => 'conv-1'),
    deleteConversation: vi.fn(async () => {}),
    renameConversation: vi.fn(async () => {}),
    onStream: (cb: StreamCallback) => {
      callback = cb;
      return () => {
        callback = null;
      };
    },
    getPlatform: () => 'desktop',
    ...overrides,
  };
  return {
    runtime,
    emit: (event: Parameters<StreamCallback>[0]) => {
      if (!callback) throw new Error('onStream callback not registered yet');
      act(() => callback!(event));
    },
  };
}

// A follow-up leaves the queue only when its turn starts, so the store needs
// a model the send preflight admits.
function sendableModel(): ModelInfo {
  const metadata = listCanonicalModels()
    .map((model) => getModelMetadataById(model.id))
    .find((candidate) => candidate !== undefined);
  if (!metadata) throw new Error('No catalog model available for the follow-up tests');
  return {
    id: metadata.id,
    name: metadata.name,
    provider: metadata.provider,
    tier: 'standard',
    supportsThinking: Boolean(metadata.capabilities.thinking),
    supportsVision: Boolean(metadata.capabilities.vision),
    supportsTools: Boolean(metadata.capabilities.tools),
    contextWindow: metadata.contextWindow ?? 128_000,
    isLocal: false,
    isByok: false,
  };
}

function followUps() {
  return useFollowUpStore.getState().byConversation['conv-1'] ?? [];
}

function sendArgs(content: string) {
  return [content] as unknown as Parameters<ReturnType<typeof useChat>['sendMessage']>;
}

describe('resolveFollowUpState', () => {
  it('steers by default and queues when the runtime cannot steer', () => {
    expect(resolveFollowUpState('steer', false, true)).toBe('steering');
    expect(resolveFollowUpState('steer', false, false)).toBe('queued');
  });

  it('inverts the setting for one message', () => {
    expect(resolveFollowUpState('steer', true, true)).toBe('queued');
    expect(resolveFollowUpState('queue', true, true)).toBe('steering');
    expect(resolveFollowUpState('queue', false, true)).toBe('queued');
  });
});

describe('useChat follow-ups while a reply is running', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'conv-1',
      conversations: [
        {
          id: 'conv-1',
          title: 'Follow-ups',
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
          executionMode: 'cloud_managed',
        },
      ],
      messagesByConversation: { 'conv-1': [] },
      isStreaming: true,
      streamingConversationIds: { 'conv-1': true },
    } as never);
    const model = sendableModel();
    useModelStore.setState({
      models: [model],
      selectedModelId: model.id,
      recentModelIds: [],
      lastRoutingDecision: null,
      thinkingEnabled: false,
    });
    useTierStore.setState({ tier: 'max', currentConversationProvider: null });
    useFollowUpStore.setState({ byConversation: {}, held: {} });
    useSettingsStore.setState({ followUpQueueMode: 'steer' });
    useTurnTodoStore.setState({ byConversation: {} });
  });

  it('hands a steer follow-up to the runtime and shows it as a user message once read', async () => {
    const steer = vi.fn(async (_conversationId: string, content: string) => ({
      id: 'steer-1',
      content,
    }));
    const { runtime, emit } = makeRuntime({ steer });
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.queueFollowUp(sendArgs('use tabs instead')));

    expect(steer).toHaveBeenCalledWith('conv-1', 'use tabs instead');
    await waitFor(() => expect(followUps()[0]?.steerId).toBe('steer-1'));
    expect(followUps()[0]?.state).toBe('steering');

    emit({ type: 'steer_consumed', steerId: 'steer-1' });

    expect(followUps()).toHaveLength(0);
    const messages = useChatStore.getState().messagesByConversation['conv-1'] ?? [];
    expect(messages[messages.length - 1]).toMatchObject({
      role: 'user',
      content: 'use tabs instead',
    });
  });

  it('queues instead of steering when the setting is queue', () => {
    useSettingsStore.setState({ followUpQueueMode: 'queue' });
    const steer = vi.fn();
    const { runtime } = makeRuntime({ steer });
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.queueFollowUp(sendArgs('next question')));

    expect(steer).not.toHaveBeenCalled();
    expect(followUps()).toMatchObject([{ content: 'next question', state: 'queued' }]);
  });

  it('queues a steer-mode follow-up when the shortcut inverts it', () => {
    const steer = vi.fn();
    const { runtime } = makeRuntime({ steer });
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.queueFollowUp(sendArgs('later'), true));

    expect(steer).not.toHaveBeenCalled();
    expect(followUps()[0]?.state).toBe('queued');
  });

  it('lets the user edit and remove a queued follow-up', () => {
    useSettingsStore.setState({ followUpQueueMode: 'queue' });
    const { runtime } = makeRuntime();
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.queueFollowUp(sendArgs('first draft')));
    const id = followUps()[0]!.id;

    act(() => result.current.editFollowUp(id, 'second draft'));
    expect(followUps()[0]).toMatchObject({ content: 'second draft' });
    expect(followUps()[0]?.args[0]).toBe('second draft');

    act(() => result.current.removeFollowUp(id));
    expect(followUps()).toHaveLength(0);
  });

  it('falls back to the queue when the runtime refuses the steer', async () => {
    const steer = vi.fn(async () => {
      throw new Error('no turn');
    });
    const { runtime } = makeRuntime({ steer });
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.queueFollowUp(sendArgs('hello')));

    await waitFor(() => expect(followUps()[0]?.state).toBe('queued'));
  });

  it('keeps a steer the host refused outright, with why, and never sends it on its own', async () => {
    const steer = vi.fn(async () => {
      throw new SteerRefusedError('A hook blocked this message: no secrets in prompts');
    });
    const { runtime, emit } = makeRuntime({ steer, supportsConcurrentTurns: true });
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.queueFollowUp(sendArgs('here is the key')));

    await waitFor(() =>
      expect(followUps()[0]).toMatchObject({
        content: 'here is the key',
        state: 'queued',
        heldReason: 'A hook blocked this message: no secrets in prompts',
      }),
    );

    act(() => {
      useChatStore.setState({ isStreaming: false, streamingConversationIds: {} } as never);
    });
    emit({ type: 'done' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(followUps()).toHaveLength(1);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps a queued follow-up, with why, when its turn cannot start, and sends it once it can', async () => {
    useSettingsStore.setState({ followUpQueueMode: 'queue' });
    const selectable = useModelStore.getState().selectedModelId;
    const { runtime } = makeRuntime({ supportsConcurrentTurns: true });
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.queueFollowUp(sendArgs('do not lose me')));
    act(() => {
      useModelStore.setState({ selectedModelId: 'no-such-model' });
      useChatStore.setState({ isStreaming: false, streamingConversationIds: {} } as never);
    });
    const id = followUps()[0]!.id;
    act(() => result.current.sendFollowUpNow(id));

    expect(followUps()).toHaveLength(1);
    expect(followUps()[0]).toMatchObject({ content: 'do not lose me', state: 'queued' });
    expect(followUps()[0]?.heldReason).toMatch(/Select a model/);
    expect(runtime.sendMessage).not.toHaveBeenCalled();

    act(() => {
      useModelStore.setState({ selectedModelId: selectable });
    });
    act(() => result.current.sendFollowUpNow(id));

    await waitFor(() => expect(followUps()).toHaveLength(0));
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('says whether the queue took a follow-up, so the composer knows to keep it', () => {
    useSettingsStore.setState({ followUpQueueMode: 'queue' });
    const { runtime } = makeRuntime();
    const { result } = renderHook(() => useChat(runtime));

    let taken = { started: false } as { started: boolean; reason?: string };
    act(() => {
      taken = result.current.queueFollowUp(sendArgs('kept by the queue'));
    });
    expect(taken.started).toBe(true);
    expect(followUps()).toHaveLength(1);

    act(() => {
      useChatStore.setState({ activeConversationId: null } as never);
    });
    act(() => {
      taken = result.current.queueFollowUp(sendArgs('nowhere to go'));
    });
    expect(taken).toEqual({
      started: false,
      reason: 'Open a conversation before sending a follow-up.',
    });
  });

  it('says a first send was turned away, and why, without starting a turn', () => {
    const { runtime } = makeRuntime();
    const { result } = renderHook(() => useChat(runtime));
    act(() => {
      useModelStore.setState({ selectedModelId: 'no-such-model' });
      useChatStore.setState({ isStreaming: false, streamingConversationIds: {} } as never);
    });

    let start = { started: true } as { started: boolean; reason?: string };
    act(() => {
      start = result.current.sendMessage(...sendArgs('first message'));
    });

    expect(start.started).toBe(false);
    expect(start.reason).toMatch(/Select a model/);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(useChatStore.getState().messagesByConversation['conv-1']).toEqual([]);
  });

  it('forgets why a follow-up was held once the user edits it', async () => {
    useSettingsStore.setState({ followUpQueueMode: 'queue' });
    const { runtime } = makeRuntime();
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.queueFollowUp(sendArgs('first wording')));
    const id = followUps()[0]!.id;
    act(() => useFollowUpStore.getState().update('conv-1', id, { heldReason: 'Blocked.' }));
    act(() => result.current.editFollowUp(id, 'second wording'));

    expect(followUps()[0]).toMatchObject({ content: 'second wording' });
    expect(followUps()[0]?.heldReason).toBeUndefined();
  });

  it('sends a follow-up whose steer is refused after the reply already ended', async () => {
    let refuseSteer: (error: Error) => void = () => {};
    const steer = vi.fn(
      () =>
        new Promise<{ id: string; content: string }>((_resolve, reject) => {
          refuseSteer = reject;
        }),
    );
    const { runtime } = makeRuntime({ steer, supportsConcurrentTurns: true });
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.queueFollowUp(sendArgs('after the reply')));
    act(() => {
      useChatStore.setState({ isStreaming: false, streamingConversationIds: {} } as never);
    });
    await act(async () => {
      refuseSteer(new Error('no turn'));
    });

    await waitFor(() => expect(followUps()).toHaveLength(0));
  });

  // The runtime may still read a message it could not be asked to give back,
  // so sending it again on its own could deliver it twice.
  it('holds the queue when a steered message cannot be taken back', async () => {
    const steer = vi.fn(async (_conversationId: string, content: string) => ({
      id: 'steer-4',
      content,
    }));
    const withdrawSteer = vi.fn(async () => {
      throw new Error('ipc closed');
    });
    const sendMessage = vi.fn(async () => {});
    const { runtime } = makeRuntime({
      steer,
      withdrawSteer,
      sendMessage,
      supportsConcurrentTurns: true,
    });
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.queueFollowUp(sendArgs('maybe twice')));
    await waitFor(() => expect(followUps()[0]?.steerId).toBe('steer-4'));
    act(() => {
      useChatStore.setState({
        activeConversationId: 'conv-2',
        isStreaming: false,
        streamingConversationIds: {},
      } as never);
    });
    act(() => {
      useChatStore.setState({ activeConversationId: 'conv-1' } as never);
    });

    await waitFor(() => expect(withdrawSteer).toHaveBeenCalled());
    await waitFor(() => expect(useFollowUpStore.getState().held['conv-1']).toBe(true));
    expect(followUps()[0]?.state).toBe('queued');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('holds the queue after the user stops the reply', () => {
    const { runtime } = makeRuntime({ supportsConcurrentTurns: true });
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.stopGeneration());

    expect(useFollowUpStore.getState().held['conv-1']).toBe(true);
  });

  it('takes back an unread steered message when the user stops, and keeps it held', async () => {
    const steer = vi.fn(async (_conversationId: string, content: string) => ({
      id: 'steer-1',
      content,
    }));
    const withdrawSteer = vi.fn(async () => true);
    const sendMessage = vi.fn(async () => {});
    const { runtime } = makeRuntime({
      steer,
      withdrawSteer,
      sendMessage,
      supportsConcurrentTurns: true,
    });
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.queueFollowUp(sendArgs('use tabs instead')));
    await waitFor(() => expect(followUps()[0]?.steerId).toBe('steer-1'));

    act(() => result.current.stopGeneration());

    await waitFor(() => expect(withdrawSteer).toHaveBeenCalledWith('conv-1', 'steer-1'));
    await waitFor(() => expect(followUps()[0]?.state).toBe('queued'));
    expect(followUps()[0]?.steerId).toBeUndefined();
    expect(useFollowUpStore.getState().held['conv-1']).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('takes back an unread steered message when the reply fails', async () => {
    const steer = vi.fn(async (_conversationId: string, content: string) => ({
      id: 'steer-2',
      content,
    }));
    const withdrawSteer = vi.fn(async () => true);
    const { runtime, emit } = makeRuntime({ steer, withdrawSteer });
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.queueFollowUp(sendArgs('also check the tests')));
    await waitFor(() => expect(followUps()[0]?.steerId).toBe('steer-2'));

    emit({ type: 'error', error: 'boom' });

    await waitFor(() => expect(withdrawSteer).toHaveBeenCalledWith('conv-1', 'steer-2'));
    await waitFor(() => expect(followUps()[0]?.state).toBe('queued'));
  });

  it('keeps a steered message queued when taking it back fails', async () => {
    const steer = vi.fn(async (_conversationId: string, content: string) => ({
      id: 'steer-3',
      content,
    }));
    const withdrawSteer = vi.fn(async () => {
      throw new Error('ipc closed');
    });
    const { runtime } = makeRuntime({ steer, withdrawSteer, supportsConcurrentTurns: true });
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.queueFollowUp(sendArgs('keep me')));
    await waitFor(() => expect(followUps()[0]?.steerId).toBe('steer-3'));

    act(() => result.current.stopGeneration());

    await waitFor(() => expect(withdrawSteer).toHaveBeenCalled());
    await waitFor(() => expect(followUps()[0]?.state).toBe('queued'));
    expect(followUps()[0]?.content).toBe('keep me');
  });

  it('ends the streaming reply before a steer that resolves after it was read', async () => {
    let resolveSteer: (value: { id: string; content: string }) => void = () => {};
    const steer = vi.fn(
      () =>
        new Promise<{ id: string; content: string }>((resolve) => {
          resolveSteer = resolve;
        }),
    );
    const { runtime, emit } = makeRuntime({ steer });
    const { result } = renderHook(() => useChat(runtime));

    emit({ type: 'content', content: 'Working on it' });
    act(() => result.current.queueFollowUp(sendArgs('use tabs instead')));
    emit({ type: 'steer_consumed', steerId: 'steer-late' });
    await act(async () => resolveSteer({ id: 'steer-late', content: 'use tabs instead' }));

    const messages = useChatStore.getState().messagesByConversation['conv-1'] ?? [];
    expect(messages[messages.length - 2]).toMatchObject({ role: 'assistant', isStreaming: false });
    expect(messages[messages.length - 1]).toMatchObject({
      role: 'user',
      content: 'use tabs instead',
    });
    expect(followUps()).toHaveLength(0);

    emit({ type: 'content', content: 'Switching to tabs' });
    const after = useChatStore.getState().messagesByConversation['conv-1'] ?? [];
    expect(after[after.length - 1]).toMatchObject({
      role: 'assistant',
      content: 'Switching to tabs',
    });
  });

  it('leaves a steered message with the reply when its still-streaming chat is opened again', async () => {
    const steer = vi.fn(async (_conversationId: string, content: string) => ({
      id: 'steer-back',
      content,
    }));
    const withdrawSteer = vi.fn(async () => true);
    const { runtime } = makeRuntime({ steer, withdrawSteer, supportsConcurrentTurns: true });
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.queueFollowUp(sendArgs('use tabs instead')));
    await waitFor(() => expect(followUps()[0]?.steerId).toBe('steer-back'));

    act(() => {
      useChatStore.setState({ activeConversationId: 'conv-2' } as never);
    });
    act(() => {
      useChatStore.setState({ activeConversationId: 'conv-1' } as never);
    });
    await act(async () => {});

    expect(withdrawSteer).not.toHaveBeenCalled();
    expect(followUps()[0]).toMatchObject({ state: 'steering', steerId: 'steer-back' });
  });

  it('takes back a steer that lands after its follow-up was removed', async () => {
    let resolveSteer: (value: { id: string; content: string }) => void = () => {};
    const steer = vi.fn(
      () =>
        new Promise<{ id: string; content: string }>((resolve) => {
          resolveSteer = resolve;
        }),
    );
    const withdrawSteer = vi.fn(async () => true);
    const { runtime } = makeRuntime({ steer, withdrawSteer });
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.queueFollowUp(sendArgs('never mind')));
    const id = followUps()[0]!.id;
    act(() => result.current.removeFollowUp(id));
    expect(followUps()).toHaveLength(0);

    await act(async () => resolveSteer({ id: 'steer-gone', content: 'never mind' }));

    await waitFor(() => expect(withdrawSteer).toHaveBeenCalledWith('conv-1', 'steer-gone'));
    expect(followUps()).toHaveLength(0);
  });

  it('sends a queued follow-up once its chat is opened again', async () => {
    useSettingsStore.setState({ followUpQueueMode: 'queue' });
    const { runtime } = makeRuntime({ supportsConcurrentTurns: true });
    const { result } = renderHook(() => useChat(runtime));

    act(() => result.current.queueFollowUp(sendArgs('next question')));
    act(() => {
      useChatStore.setState({
        activeConversationId: 'conv-2',
        isStreaming: false,
        streamingConversationIds: {},
      } as never);
    });
    await act(async () => {});
    expect(followUps()).toHaveLength(1);

    act(() => {
      useChatStore.setState({ activeConversationId: 'conv-1' } as never);
    });

    await waitFor(() => expect(followUps()).toHaveLength(0));
  });

  it('records the task list a todo_write call carries for the running turn', () => {
    const { runtime, emit } = makeRuntime();
    renderHook(() => useChat(runtime));

    emit({
      type: 'tool_call',
      toolCall: {
        id: 'call-1',
        name: 'todo_write',
        args: {
          todos: [
            { id: 'a', title: 'Read the failing test', status: 'completed' },
            { id: 'b', title: 'Fix the parser', status: 'in_progress' },
          ],
        },
      },
    });

    expect(useTurnTodoStore.getState().byConversation['conv-1']).toEqual([
      { id: 'a', title: 'Read the failing test', status: 'completed' },
      { id: 'b', title: 'Fix the parser', status: 'in_progress' },
    ]);
  });

  it('shows a question the agent asked and sends the answer back', async () => {
    const answerQuestion = vi.fn(async () => {});
    const { runtime, emit } = makeRuntime({ answerQuestion });
    const { result } = renderHook(() => useChat(runtime));
    const question = {
      id: 'q-1',
      question: 'Which branch?',
      choices: ['main', 'dev'],
      multiSelect: false,
    };

    emit({ type: 'question', question });
    expect(useAgentQuestionStore.getState().byConversation['conv-1']).toEqual(question);

    await act(() => result.current.answerQuestion(question, 'dev'));

    expect(answerQuestion).toHaveBeenCalledWith('q-1', 'dev');
    expect(useAgentQuestionStore.getState().byConversation['conv-1']).toBeUndefined();
  });

  it('records a turn notice for the conversation', () => {
    const { runtime, emit } = makeRuntime();
    renderHook(() => useChat(runtime));

    emit({ type: 'notice', message: 'Write file was not run in plan mode.' });

    expect(useTurnNoticeStore.getState().byConversation['conv-1']).toEqual([
      'Write file was not run in plan mode.',
    ]);
  });

  it('drops a question the reply no longer waits on', () => {
    const { runtime, emit } = makeRuntime({ supportsConcurrentTurns: true });
    const { result } = renderHook(() => useChat(runtime));
    const question = { id: 'q-9', question: 'Continue?', choices: ['yes'], multiSelect: false };

    emit({ type: 'question', question });
    emit({ type: 'tool_result', toolCallId: 'call-q', error: 'Tool cancelled by user' });
    expect(useAgentQuestionStore.getState().byConversation['conv-1']).toBeUndefined();

    emit({ type: 'question', question });
    act(() => result.current.stopGeneration());
    expect(useAgentQuestionStore.getState().byConversation['conv-1']).toBeUndefined();
  });
});

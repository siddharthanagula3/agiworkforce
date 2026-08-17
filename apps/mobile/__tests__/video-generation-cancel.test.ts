const mockMmkvValues = new Map<string, string>();
jest.mock('../lib/mmkv', () => ({
  ...jest.requireActual('../lib/mmkv'),
  storage: {
    getString: (key: string) => mockMmkvValues.get(key),
    set: (key: string, value: string) => mockMmkvValues.set(key, value),
    delete: (key: string) => mockMmkvValues.delete(key),
  },
}));

const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock('@/services/api', () => ({
  api: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
  },
  ApiPaywallError: class extends Error {},
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '12345678-abcd-4abc-8abc-1234567890ab' }));

import {
  cancelVideoGeneration,
  generateVideo,
  VIDEO_POLL_INTERVAL_MS,
} from '../src/features/video/services/videogen';
import { runVideoGenerationTurn } from '../src/features/chat/actions/runVideoGenerationTurn';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';

const TASK_ID = '4d1a9b7e-2c3f-4a58-9e11-6b7c8d9e0f12';
const CONVERSATION_ID = 'conversation-1';
const ASSISTANT_MESSAGE_ID = 'assistant-1';

function seedGeneratingVideoMessage(overrides: Record<string, unknown> = {}) {
  useChatMessageStore.setState({
    conversations: [
      {
        id: CONVERSATION_ID,
        title: 'a kite over the sea',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ] as never,
    messages: {
      [CONVERSATION_ID]: [
        {
          id: ASSISTANT_MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          isGeneratingVideo: true,
          videoGenStatus: 'processing',
          videoGenPrompt: 'a kite over the sea',
          videoTaskId: TASK_ID,
          ...overrides,
        },
      ],
    } as never,
  });
}

function createCallbacks() {
  return {
    begin: jest.fn(() => 'assistant-1'),
    complete: jest.fn(),
    fail: jest.fn(),
    remove: jest.fn(),
    onPaywall: jest.fn(),
  };
}

describe('stopping a mobile video generation', () => {
  beforeEach(() => {
    mockMmkvValues.clear();
    mockPost.mockReset();
    mockGet.mockReset();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('default-test-account');
  });

  it('asks the server to cancel the durable task', async () => {
    mockPost.mockResolvedValue({ success: true, task_id: TASK_ID, status: 'processing' });

    await cancelVideoGeneration(TASK_ID);

    expect(mockPost).toHaveBeenCalledWith('/api/media/video/cancel', { task_id: TASK_ID });
  });

  it('reports the durable task id so a client stop has something to cancel', async () => {
    mockPost.mockResolvedValue({ task_id: TASK_ID, status: 'queued' });
    mockGet.mockResolvedValue({
      task_id: TASK_ID,
      status: 'completed',
      video_url: '/api/files/22222222-2222-4222-8222-222222222222',
    });
    const onTaskCreated = jest.fn();
    jest.useFakeTimers();

    try {
      const pending = generateVideo(
        { prompt: 'a kite over the sea', model: 'registry-video-route' },
        { onTaskCreated },
      );
      await jest.advanceTimersByTimeAsync(VIDEO_POLL_INTERVAL_MS);
      await pending;
    } finally {
      jest.useRealTimers();
    }

    expect(onTaskCreated).toHaveBeenCalledWith(TASK_ID);
  });

  it('hands the task id to the caller that owns the message', async () => {
    const callbacks = createCallbacks();
    const taskCreated = jest.fn();
    const generate = jest.fn(
      async (
        _request: unknown,
        options: {
          onTaskCreated?: (taskId: string) => void;
          shouldCancel?: () => boolean;
        },
      ) => {
        options.onTaskCreated?.(TASK_ID);
        return { videoUrl: 'https://example.com/video.mp4' };
      },
    );

    await runVideoGenerationTurn(
      {
        conversationId: 'conversation-1',
        displayText: 'a kite over the sea',
        prompt: 'a kite over the sea',
        model: 'registry-video-route',
        ownerId: 'default-test-account',
        taskCreated,
        ...callbacks,
      },
      { generate: generate as never },
    );

    expect(taskCreated).toHaveBeenCalledWith('conversation-1', 'assistant-1', TASK_ID);
  });

  it('stops polling and leaves the turn alone once the user requested a stop', async () => {
    const callbacks = createCallbacks();
    let cancelRequested = false;
    const generate = jest.fn(
      async (_request: unknown, options: { shouldCancel?: () => boolean }) => {
        cancelRequested = true;
        if (options.shouldCancel?.() === true) throw new Error('Video generation was cancelled');
        return { videoUrl: 'https://example.com/video.mp4' };
      },
    );

    const outcome = await runVideoGenerationTurn(
      {
        conversationId: 'conversation-1',
        displayText: 'a kite over the sea',
        prompt: 'a kite over the sea',
        model: 'registry-video-route',
        ownerId: 'default-test-account',
        isCancelRequested: () => cancelRequested,
        ...callbacks,
      },
      { generate: generate as never },
    );

    expect(outcome).toEqual({ status: 'cancelled', assistantMessageId: 'assistant-1' });
    expect(callbacks.fail).not.toHaveBeenCalled();
    expect(callbacks.complete).not.toHaveBeenCalled();
  });

  it('does not settle a stopped turn as completed when the provider result lands late', async () => {
    const callbacks = createCallbacks();
    let cancelRequested = false;
    const generate = jest.fn(async () => {
      cancelRequested = true;
      return { videoUrl: 'https://example.com/video.mp4' };
    });

    const outcome = await runVideoGenerationTurn(
      {
        conversationId: 'conversation-1',
        displayText: 'a kite over the sea',
        prompt: 'a kite over the sea',
        model: 'registry-video-route',
        ownerId: 'default-test-account',
        isCancelRequested: () => cancelRequested,
        ...callbacks,
      },
      { generate: generate as never },
    );

    expect(outcome).toEqual({ status: 'cancelled', assistantMessageId: 'assistant-1' });
    expect(callbacks.complete).not.toHaveBeenCalled();
  });

  describe('the in-message stop control', () => {
    function assistantMessage() {
      return useChatMessageStore
        .getState()
        .messages[CONVERSATION_ID]?.find((message) => message.id === ASSISTANT_MESSAGE_ID);
    }

    it('cancels the durable task and settles the turn as stopped', async () => {
      seedGeneratingVideoMessage();
      mockPost.mockResolvedValue({
        success: true,
        task_id: TASK_ID,
        status: 'processing',
        message: 'Cancellation was recorded.',
      });

      await useChatMessageStore
        .getState()
        .stopVideoGeneration(CONVERSATION_ID, ASSISTANT_MESSAGE_ID);

      expect(mockPost).toHaveBeenCalledWith('/api/media/video/cancel', { task_id: TASK_ID });
      expect(assistantMessage()).toEqual(
        expect.objectContaining({
          isGeneratingVideo: false,
          videoGenStatus: 'cancelled',
          content: 'Cancellation was recorded.',
        }),
      );
    });

    it('tells the polling turn to stop', async () => {
      seedGeneratingVideoMessage();
      mockPost.mockResolvedValue({ success: true, task_id: TASK_ID, status: 'processing' });

      const pending = useChatMessageStore
        .getState()
        .stopVideoGeneration(CONVERSATION_ID, ASSISTANT_MESSAGE_ID);
      expect(
        useChatMessageStore
          .getState()
          .isVideoGenerationCancelRequested(CONVERSATION_ID, ASSISTANT_MESSAGE_ID),
      ).toBe(true);
      await pending;
    });

    it('keeps the turn running and says why when the cancel request fails', async () => {
      seedGeneratingVideoMessage();
      mockPost.mockRejectedValue(new Error('HTTP 503'));

      await useChatMessageStore
        .getState()
        .stopVideoGeneration(CONVERSATION_ID, ASSISTANT_MESSAGE_ID);

      expect(assistantMessage()).toEqual(
        expect.objectContaining({
          isGeneratingVideo: true,
          videoGenCancelRequested: false,
          videoGenCancelError: 'HTTP 503',
        }),
      );
    });

    it('does nothing when no durable task is known yet', async () => {
      seedGeneratingVideoMessage({ videoTaskId: undefined });

      await useChatMessageStore
        .getState()
        .stopVideoGeneration(CONVERSATION_ID, ASSISTANT_MESSAGE_ID);

      expect(mockPost).not.toHaveBeenCalled();
    });
  });
});

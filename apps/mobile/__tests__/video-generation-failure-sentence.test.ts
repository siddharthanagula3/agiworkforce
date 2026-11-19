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
jest.mock('@/services/llmGate', () => ({
  ...jest.requireActual('@/services/llmGate'),
  ensureCloudSendConsent: async () => undefined,
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '12345678-abcd-4abc-8abc-1234567890ab' }));

import {
  generateVideo,
  VideoGenerationFailedError,
  VIDEO_POLL_INTERVAL_MS,
} from '../src/features/video/services/videogen';
import { runVideoGenerationTurn } from '../src/features/chat/actions/runVideoGenerationTurn';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const TASK_ID = '4d1a9b7e-2c3f-4a58-9e11-6b7c8d9e0f12';
const SERVER_SENTENCE = 'Your prompt was flagged by our content safety filters. Please try again.';

function createCallbacks() {
  return {
    begin: jest.fn(() => 'assistant-1'),
    complete: jest.fn(),
    fail: jest.fn(),
    remove: jest.fn(),
    onPaywall: jest.fn(),
    onUnexpectedError: jest.fn(),
  };
}

function runFailedVideoTurn(statusBody: Record<string, unknown>) {
  mockPost.mockResolvedValue({ task_id: TASK_ID, status: 'queued' });
  mockGet.mockResolvedValue({ task_id: TASK_ID, status: 'failed', ...statusBody });
  const callbacks = createCallbacks();
  const turn = runVideoGenerationTurn(
    {
      conversationId: 'conversation-1',
      displayText: 'a kite over the sea',
      prompt: 'a kite over the sea',
      model: 'registry-video-route',
      ownerId: 'default-test-account',
      ...callbacks,
    },
    { generate: (request, options) => generateVideo(request, options) },
  );
  return { callbacks, turn };
}

describe('a failed video in the chat', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockMmkvValues.clear();
    mockPost.mockReset();
    mockGet.mockReset();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('default-test-account');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('carries the sentence the server wrote for the failed job', async () => {
    const { callbacks, turn } = runFailedVideoTurn({ error: SERVER_SENTENCE });
    await jest.advanceTimersByTimeAsync(VIDEO_POLL_INTERVAL_MS);

    await expect(turn).resolves.toEqual({ status: 'failed', assistantMessageId: 'assistant-1' });
    expect(callbacks.fail).toHaveBeenCalledWith('conversation-1', 'assistant-1', SERVER_SENTENCE);
    expect(callbacks.onUnexpectedError).not.toHaveBeenCalled();
  });

  it('keeps the generic sentence when the server sends none', async () => {
    const { callbacks, turn } = runFailedVideoTurn({ status: 'timeout' });
    await jest.advanceTimersByTimeAsync(VIDEO_POLL_INTERVAL_MS);

    await expect(turn).resolves.toEqual({ status: 'failed', assistantMessageId: 'assistant-1' });
    expect(callbacks.fail).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
      'Video generation failed. Try again.',
    );
  });

  it('keeps the generic sentence when the server sentence is blank', async () => {
    const { callbacks, turn } = runFailedVideoTurn({ error: '   ' });
    await jest.advanceTimersByTimeAsync(VIDEO_POLL_INTERVAL_MS);

    await turn;
    expect(callbacks.fail).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
      'Video generation failed. Try again.',
    );
  });

  it('names the server sentence on the error the poll throws', async () => {
    mockPost.mockResolvedValue({ task_id: TASK_ID, status: 'queued' });
    mockGet.mockResolvedValue({ task_id: TASK_ID, status: 'failed', error: SERVER_SENTENCE });
    const outcome = generateVideo({ prompt: 'a kite', model: 'registry-video-route' });
    const settled = outcome.catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(VIDEO_POLL_INTERVAL_MS);

    const error = await settled;
    expect(error).toBeInstanceOf(VideoGenerationFailedError);
    expect((error as VideoGenerationFailedError).publicMessage).toBe(SERVER_SENTENCE);
  });
});

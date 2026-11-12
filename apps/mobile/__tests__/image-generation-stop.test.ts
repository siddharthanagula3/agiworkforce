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
jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { imageGen: true } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '12345678-abcd-4abc-8abc-1234567890ab' }));

import { ApiHttpError } from '../services/apiErrors';
import {
  cancelImageGeneration,
  generateImage,
  ImageGenerationStoppedError,
} from '../src/features/image/services/imagegen';
import {
  clearStoppedImageGenerations,
  isImageGenerationStopped,
} from '../src/features/image/services/imageGenerationStops';
import { resolveImageRetryFallback } from '../src/features/chat/actions/imageRetryFallback';
import { IMAGE_REFERENCE_UNAVAILABLE_MESSAGE } from '../src/features/chat/actions/mediaGenerationError';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';

const JOB_ID = '0190a000-0000-4000-8000-000000000001';
const FILE_PATH = '/api/files/0190a000-0000-4000-8000-000000000002';
const CONVERSATION_ID = 'conversation-1';
const ASSISTANT_MESSAGE_ID = 'assistant-1';

function postedPaths(): string[] {
  return mockPost.mock.calls.map((call) => call[0] as string);
}

describe('stopping an image generation', () => {
  beforeEach(() => {
    mockMmkvValues.clear();
    mockPost.mockReset();
    mockGet.mockReset();
    clearStoppedImageGenerations();
  });

  describe('the cancel request', () => {
    it('remembers the stop at once, before the server answers', () => {
      mockPost.mockReturnValue(new Promise(() => undefined));

      void cancelImageGeneration('operation-1');

      expect(isImageGenerationStopped('operation-1')).toBe(true);
      expect(isImageGenerationStopped('operation-2')).toBe(false);
    });

    it('treats "that image has not started yet" as a stop with nothing to cancel', async () => {
      mockPost.mockRejectedValue(new ApiHttpError('That image has not started yet.', 404));

      await expect(cancelImageGeneration('operation-1')).resolves.toBeNull();
      expect(isImageGenerationStopped('operation-1')).toBe(true);
    });

    it('still reports a cancel the server could not be asked', async () => {
      mockPost.mockRejectedValue(new ApiHttpError('Service unavailable', 503));

      await expect(cancelImageGeneration('operation-1')).rejects.toThrow('Service unavailable');
    });

    it('keeps only a bounded number of stopped operations', async () => {
      mockPost.mockResolvedValue({});

      for (let i = 0; i < 100; i += 1) await cancelImageGeneration(`operation-${i}`);

      expect(isImageGenerationStopped('operation-0')).toBe(false);
      expect(isImageGenerationStopped('operation-99')).toBe(true);
    });
  });

  describe('the generation request', () => {
    it('never submits a job for an operation that was stopped first', async () => {
      mockPost.mockResolvedValue({});
      await cancelImageGeneration('operation-1');
      mockPost.mockClear();

      await expect(
        generateImage({ prompt: 'a cat' }, { operationId: 'operation-1' }),
      ).rejects.toBeInstanceOf(ImageGenerationStoppedError);

      expect(mockPost).not.toHaveBeenCalled();
    });

    it('cancels the job it just admitted when Stop landed while the submit was in flight', async () => {
      let release: (value: unknown) => void = () => undefined;
      mockPost.mockImplementation((path: string) =>
        path === '/api/media/image/generate'
          ? new Promise((resolve) => {
              release = resolve;
            })
          : Promise.resolve({ job_id: JOB_ID, status: 'canceled' }),
      );

      const pending = generateImage({ prompt: 'a cat' }, { operationId: 'operation-1' });
      const rejected = expect(pending).rejects.toBeInstanceOf(ImageGenerationStoppedError);
      await Promise.resolve();
      void cancelImageGeneration('operation-1');
      release({ success: true, job_id: JOB_ID, status: 'queued', images: [] });
      await rejected;

      expect(postedPaths().filter((path) => path === '/api/media/image/cancel')).toHaveLength(2);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('stops following a job once the user stops it', async () => {
      jest.useFakeTimers();
      try {
        mockPost.mockImplementation((path: string) =>
          path === '/api/media/image/generate'
            ? Promise.resolve({ success: true, job_id: JOB_ID, status: 'queued', images: [] })
            : Promise.resolve({ job_id: JOB_ID, status: 'canceled' }),
        );

        const pending = generateImage({ prompt: 'a cat' }, { operationId: 'operation-1' });
        const rejected = expect(pending).rejects.toBeInstanceOf(ImageGenerationStoppedError);
        await jest.advanceTimersByTimeAsync(0);
        void cancelImageGeneration('operation-1');
        await jest.advanceTimersByTimeAsync(2_000);
        await rejected;

        expect(mockGet).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('the in-message stop control', () => {
    function seedGeneratingImageMessage() {
      useChatMessageStore.setState({
        conversations: [
          {
            id: CONVERSATION_ID,
            title: 'a lighthouse',
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
              model: 'registry-image-route',
              isGeneratingImage: true,
              imageGenStatus: 'generating',
              imageGenPrompt: 'a lighthouse',
            },
          ],
        } as never,
      });
    }

    function assistantMessage() {
      return useChatMessageStore
        .getState()
        .messages[CONVERSATION_ID]?.find((message) => message.id === ASSISTANT_MESSAGE_ID);
    }

    async function settle() {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    }

    it('keeps the turn stopped when the job was cancelled', async () => {
      seedGeneratingImageMessage();
      mockPost.mockResolvedValue({ job_id: JOB_ID, status: 'canceled', images: [] });

      useChatMessageStore.getState().stopImageGeneration(CONVERSATION_ID, ASSISTANT_MESSAGE_ID);
      await settle();

      expect(assistantMessage()).toEqual(
        expect.objectContaining({ isGeneratingImage: false, imageGenStatus: 'failed' }),
      );
      expect(assistantMessage()?.imageUrl).toBeUndefined();
    });

    it('does not claim the job could not be reached when it had not started', async () => {
      seedGeneratingImageMessage();
      mockPost.mockRejectedValue(new ApiHttpError('That image has not started yet.', 404));

      useChatMessageStore.getState().stopImageGeneration(CONVERSATION_ID, ASSISTANT_MESSAGE_ID);
      await settle();

      expect(assistantMessage()?.imageGenError).toBe(
        'You stopped this image generation. Retry to run it again.',
      );
    });

    it('says so when AGI Cloud could not be asked to stop the job', async () => {
      seedGeneratingImageMessage();
      mockPost.mockRejectedValue(new ApiHttpError('Service unavailable', 503));

      useChatMessageStore.getState().stopImageGeneration(CONVERSATION_ID, ASSISTANT_MESSAGE_ID);
      await settle();

      expect(assistantMessage()?.imageGenError).toMatch(/may still finish/);
    });

    it('shows the image when the server had already finished it', async () => {
      seedGeneratingImageMessage();
      mockPost.mockResolvedValue({
        job_id: JOB_ID,
        status: 'completed',
        model: 'registry-image-route',
        images: [{ url: FILE_PATH }],
      });

      useChatMessageStore.getState().stopImageGeneration(CONVERSATION_ID, ASSISTANT_MESSAGE_ID);
      await settle();

      expect(assistantMessage()).toEqual(
        expect.objectContaining({
          type: 'image',
          imageUrl: FILE_PATH,
          isGeneratingImage: false,
          imageGenStatus: 'completed',
        }),
      );
    });
  });
});

describe('retrying an image turn without its saved request', () => {
  it('resends a plain text prompt', () => {
    expect(resolveImageRetryFallback({ content: '/image a cat' })).toEqual({
      kind: 'resend',
      text: '/image a cat',
    });
  });

  it('refuses to turn an image edit into a new generation', () => {
    expect(
      resolveImageRetryFallback({
        content: '/image make the background blue',
        attachments: [{ url: 'file:///photo.jpg', mimeType: 'image/jpeg', fileName: 'photo.jpg' }],
      }),
    ).toEqual({ kind: 'reference_unavailable', message: IMAGE_REFERENCE_UNAVAILABLE_MESSAGE });
  });
});

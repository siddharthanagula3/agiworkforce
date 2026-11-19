const mockMmkvValues = new Map<string, string>();
jest.mock('../lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockMmkvValues.get(key),
    set: (key: string, value: string) => mockMmkvValues.set(key, value),
    delete: (key: string) => mockMmkvValues.delete(key),
  },
}));

import { ManagedMediaImageGenerationRequestSchema } from '@agiworkforce/cloud-contracts';
import { ApiPaywallError } from '../services/api';
import { ApiHttpError, CLOUD_SIGN_IN_MESSAGE } from '../services/apiErrors';
import {
  clearCloudImageGenerationState,
  runImageGenerationTurn,
  takeImageEditRetry,
} from '../src/features/chat/actions/runImageGenerationTurn';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import type { ImageGenResponse } from '../src/features/image/services/imagegen';

function createCallbacks() {
  return {
    begin: jest.fn(() => 'assistant-1'),
    complete: jest.fn(),
    fail: jest.fn(),
    remove: jest.fn(),
    onPaywall: jest.fn(),
  };
}

describe('runImageGenerationTurn', () => {
  beforeEach(() => {
    mockMmkvValues.clear();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('default-test-account');
  });

  it('fails closed before creating a turn when no Cloud account owns the request', async () => {
    __resetCloudAccountSessionForTests();
    mockMmkvValues.clear();
    const callbacks = { ...createCallbacks(), onStarted: jest.fn(), onUnexpectedError: jest.fn() };
    const generate = jest.fn();

    await expect(
      runImageGenerationTurn(
        {
          conversationId: 'ownerless-conversation',
          displayText: '/image private design',
          prompt: 'private design',
          model: 'registry-image-route',
          ownerId: 'default-test-account',
          ...callbacks,
        },
        { generate, getUri: () => null },
      ),
    ).resolves.toEqual({ status: 'failed', assistantMessageId: null });

    expect(callbacks.begin).not.toHaveBeenCalled();
    expect(callbacks.onStarted).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(callbacks.onUnexpectedError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: CLOUD_SIGN_IN_MESSAGE,
      }),
    );
  });

  it('fails closed when the request owner does not match the active Cloud account', async () => {
    activateCloudAccount('account-a');
    const callbacks = { ...createCallbacks(), onStarted: jest.fn(), onUnexpectedError: jest.fn() };
    const generate = jest.fn();

    await expect(
      runImageGenerationTurn(
        {
          conversationId: 'account-b-conversation',
          displayText: '/image private design',
          prompt: 'private design',
          model: 'registry-image-route',
          ownerId: 'account-b',
          ...callbacks,
        },
        { generate, getUri: () => null },
      ),
    ).resolves.toEqual({ status: 'failed', assistantMessageId: null });

    expect(callbacks.begin).not.toHaveBeenCalled();
    expect(callbacks.onStarted).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(callbacks.onUnexpectedError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'The active AGI Cloud account changed before image generation started.',
      }),
    );
  });

  it('owns the shared begin, provider call, and completion mechanics', async () => {
    const callbacks = { ...createCallbacks(), onStarted: jest.fn() };
    const generate = jest.fn(async () => ({
      success: true,
      images: [{ url: 'https://example.com/generated.png', revisedPrompt: 'Refined prompt' }],
      model: 'registry-image-route',
    }));

    const outcome = await runImageGenerationTurn(
      {
        conversationId: 'conversation-1',
        displayText: 'Create an image of Mars',
        prompt: 'Create an image of Mars',
        model: 'registry-image-route',
        ownerId: 'default-test-account',
        ...callbacks,
      },
      {
        generate,
        getUri: (image) => image?.url ?? null,
      },
    );

    expect(generate).toHaveBeenCalledWith(
      { prompt: 'Create an image of Mars', model: 'registry-image-route' },
      { operationId: 'assistant-1' },
    );
    expect(callbacks.begin).toHaveBeenCalledWith(
      'conversation-1',
      'Create an image of Mars',
      'Create an image of Mars',
      'registry-image-route',
    );
    expect(callbacks.onStarted).toHaveBeenCalledTimes(1);
    expect(callbacks.complete).toHaveBeenCalledWith('conversation-1', 'assistant-1', {
      imageUrl: 'https://example.com/generated.png',
      persisted: false,
      persistenceWarning: 'This image couldn’t be saved and is available for this session only.',
      revisedPrompt: 'Refined prompt',
      model: 'registry-image-route',
    });
    expect(callbacks.fail).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'completed', assistantMessageId: 'assistant-1' });
  });

  it('fails a hung generation on its own timeout instead of stranding the turn', async () => {
    const callbacks = { ...createCallbacks(), onUnexpectedError: jest.fn() };
    const generate = jest.fn(() => new Promise<never>(() => undefined));

    const outcome = await runImageGenerationTurn(
      {
        conversationId: 'conversation-1',
        displayText: '/image Mars',
        prompt: 'Mars',
        model: 'registry-image-route',
        ownerId: 'default-test-account',
        ...callbacks,
      },
      {
        generate,
        getUri: (image) => image?.url ?? null,
        timeoutMs: 5,
      },
    );

    expect(callbacks.fail).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
      expect.stringContaining('timed out'),
    );
    expect(callbacks.onUnexpectedError).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'failed', assistantMessageId: 'assistant-1' });
  });

  it('removes the placeholder and delegates paywall presentation', async () => {
    const callbacks = createCallbacks();
    const error = new ApiPaywallError('image_quota', 'pro', 'Monthly image limit reached');

    const outcome = await runImageGenerationTurn(
      {
        conversationId: 'conversation-1',
        displayText: '/image Mars',
        prompt: 'Mars',
        model: 'registry-image-route',
        ownerId: 'default-test-account',
        ...callbacks,
      },
      {
        generate: async () => {
          throw error;
        },
        getUri: () => null,
      },
    );

    expect(callbacks.remove).toHaveBeenCalledWith('conversation-1', 'assistant-1');
    expect(callbacks.onPaywall).toHaveBeenCalledWith(error);
    expect(callbacks.fail).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'paywall', assistantMessageId: 'assistant-1' });
  });

  it('leaves a visible failed image turn for provider failures', async () => {
    const callbacks = createCallbacks();

    const outcome = await runImageGenerationTurn(
      {
        conversationId: 'conversation-1',
        displayText: '/image Mars',
        prompt: 'Mars',
        model: 'registry-image-route',
        ownerId: 'default-test-account',
        ...callbacks,
      },
      {
        generate: async () => ({ success: false, error: 'Provider unavailable at /private/route' }),
        getUri: () => null,
      },
    );

    expect(callbacks.fail).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
      'AGI Cloud did not return an image. Try again.',
    );
    expect(outcome).toEqual({ status: 'failed', assistantMessageId: 'assistant-1' });
  });

  it('keeps thrown provider diagnostics out of a failed image turn', async () => {
    const callbacks = createCallbacks();
    const outcome = await runImageGenerationTurn(
      {
        conversationId: 'conversation-1',
        displayText: '/image Mars',
        prompt: 'Mars',
        model: 'registry-image-route',
        ownerId: 'default-test-account',
        ...callbacks,
      },
      {
        generate: async () => {
          throw new Error('Provider token failed at /private/image-route');
        },
        getUri: () => null,
      },
    );

    expect(outcome).toEqual({ status: 'failed', assistantMessageId: 'assistant-1' });
    expect(callbacks.fail).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
      'Image generation failed. Try again.',
    );
  });

  it('hands a rate limit back with the server sentence and when to retry', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-15T10:00:00Z'));
    try {
      const callbacks = { ...createCallbacks(), onUnexpectedError: jest.fn() };
      const outcome = await runImageGenerationTurn(
        {
          conversationId: 'conversation-1',
          displayText: '/image Mars',
          prompt: 'Mars',
          model: 'registry-image-route',
          ownerId: 'default-test-account',
          ...callbacks,
        },
        {
          generate: async () => {
            throw new ApiHttpError(
              'Too many requests right now. Try again in 30 seconds.',
              429,
              null,
              {
                retryAfterSeconds: 30,
              },
            );
          },
          getUri: () => null,
        },
      );

      expect(callbacks.fail).toHaveBeenCalledWith(
        'conversation-1',
        'assistant-1',
        'Too many requests right now. Try again in 30 seconds.',
        Date.now() + 30_000,
      );
      expect(callbacks.onUnexpectedError).not.toHaveBeenCalled();
      expect(outcome).toEqual({ status: 'failed', assistantMessageId: 'assistant-1' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('leaves Retry open when a rate limit names no wait', async () => {
    const callbacks = createCallbacks();
    await runImageGenerationTurn(
      {
        conversationId: 'conversation-1',
        displayText: '/image Mars',
        prompt: 'Mars',
        model: 'registry-image-route',
        ownerId: 'default-test-account',
        ...callbacks,
      },
      {
        generate: async () => {
          throw new ApiHttpError(
            'Too many requests right now. Please wait a moment and try again.',
            429,
          );
        },
        getUri: () => null,
      },
    );

    expect(callbacks.fail).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
      'Too many requests right now. Please wait a moment and try again.',
      undefined,
    );
  });

  it('drops an account-A image result that resolves after account B becomes active', async () => {
    activateCloudAccount('account-a');
    const callbacks = createCallbacks();
    let resolveGeneration:
      | ((value: { success: boolean; persisted: boolean; images: Array<{ url: string }> }) => void)
      | undefined;
    const generation = new Promise<{
      success: boolean;
      persisted: boolean;
      images: Array<{ url: string }>;
    }>((resolve) => {
      resolveGeneration = resolve;
    });

    const pending = runImageGenerationTurn(
      {
        conversationId: 'account-a-conversation',
        displayText: '/image private design',
        prompt: 'private design',
        model: 'registry-image-route',
        ownerId: 'account-a',
        ...callbacks,
      },
      {
        generate: () => generation,
        getUri: (image) => image?.url ?? null,
      },
    );

    activateCloudAccount('account-b');
    resolveGeneration?.({
      success: true,
      persisted: true,
      images: [{ url: '/api/files/00000000-0000-0000-0000-000000000001' }],
    });

    await expect(pending).resolves.toEqual({
      status: 'cancelled',
      assistantMessageId: 'assistant-1',
    });
    expect(callbacks.complete).not.toHaveBeenCalled();
    expect(callbacks.fail).not.toHaveBeenCalled();
    expect(callbacks.remove).not.toHaveBeenCalled();
    expect(callbacks.onPaywall).not.toHaveBeenCalled();
  });

  it('sends the reference image as a contract-valid edit request', async () => {
    const callbacks = createCallbacks();
    const generate = jest.fn(async () => ({
      success: true,
      persisted: true,
      images: [{ url: '/api/files/00000000-0000-0000-0000-000000000002' }],
      model: 'registry-image-route',
    }));
    const readReferenceImage = jest.fn(async () => 'cmVmZXJlbmNlLWJ5dGVz');

    const outcome = await runImageGenerationTurn(
      {
        conversationId: 'conversation-1',
        displayText: 'make it a poster',
        prompt: 'make it a poster',
        model: 'registry-image-route',
        operation: 'edit',
        sourceImage: { uri: 'file:///photo.jpg', mimeType: 'image/jpeg', fileName: 'photo.jpg' },
        ownerId: 'default-test-account',
        ...callbacks,
      },
      { generate, getUri: (image) => image?.url ?? null, readReferenceImage },
    );

    expect(readReferenceImage).toHaveBeenCalledWith('file:///photo.jpg');
    expect(callbacks.begin).toHaveBeenCalledWith(
      'conversation-1',
      'make it a poster',
      'make it a poster',
      'registry-image-route',
      [{ url: 'file:///photo.jpg', mimeType: 'image/jpeg', fileName: 'photo.jpg' }],
    );
    expect(generate).toHaveBeenCalledWith(
      {
        prompt: 'make it a poster',
        model: 'registry-image-route',
        operation: 'edit',
        source_image: { b64_json: 'cmVmZXJlbmNlLWJ5dGVz' },
      },
      { operationId: expect.any(String) },
    );
    expect(
      ManagedMediaImageGenerationRequestSchema.safeParse(generate.mock.calls[0]?.[0]).success,
    ).toBe(true);
    expect(outcome).toEqual({ status: 'completed', assistantMessageId: 'assistant-1' });
  });

  it('fails the turn instead of silently generating from text when the reference image cannot be read', async () => {
    const callbacks = { ...createCallbacks(), onUnexpectedError: jest.fn() };
    const generate = jest.fn();

    const outcome = await runImageGenerationTurn(
      {
        conversationId: 'conversation-1',
        displayText: 'make it a poster',
        prompt: 'make it a poster',
        model: 'registry-image-route',
        operation: 'edit',
        sourceImage: { uri: 'file:///gone.jpg', mimeType: 'image/jpeg', fileName: 'gone.jpg' },
        ownerId: 'default-test-account',
        ...callbacks,
      },
      {
        generate,
        getUri: () => null,
        readReferenceImage: async () => {
          throw new Error('The reference image could not be read from this device.');
        },
      },
    );

    expect(generate).not.toHaveBeenCalled();
    expect(callbacks.fail).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
      'The reference image could not be read from this device.',
    );
    expect(outcome).toEqual({ status: 'failed', assistantMessageId: 'assistant-1' });
  });

  describe('stopping before the job is admitted', () => {
    const referenceEdit = {
      conversationId: 'conversation-1',
      displayText: 'make it a poster',
      prompt: 'make it a poster',
      model: 'registry-image-route',
      operation: 'edit' as const,
      sourceImage: { uri: 'file:///photo.jpg', mimeType: 'image/jpeg', fileName: 'photo.jpg' },
      referenceImages: [
        { uri: 'file:///guide.jpg', mimeType: 'image/jpeg', fileName: 'guide.jpg' },
      ],
      ownerId: 'default-test-account',
    };

    beforeEach(() => {
      clearCloudImageGenerationState();
    });

    it('submits nothing when Stop lands while the reference image is being read', async () => {
      const callbacks = { ...createCallbacks(), onUnexpectedError: jest.fn() };
      let stopped = false;
      const generate = jest.fn();
      const readReferenceImage = jest.fn(async () => {
        stopped = true;
        return 'cmVmZXJlbmNl';
      });

      const outcome = await runImageGenerationTurn(
        { ...referenceEdit, ...callbacks },
        { generate, getUri: () => null, readReferenceImage, isStopped: () => stopped },
      );

      expect(generate).not.toHaveBeenCalled();
      expect(callbacks.fail).not.toHaveBeenCalled();
      expect(callbacks.complete).not.toHaveBeenCalled();
      expect(callbacks.onUnexpectedError).not.toHaveBeenCalled();
      expect(outcome).toEqual({
        status: 'cancelled',
        assistantMessageId: 'assistant-1',
        stopped: true,
      });
    });

    it('submits nothing when Stop lands while a guide image is being read', async () => {
      const callbacks = createCallbacks();
      let stopped = false;
      const generate = jest.fn();
      const readReferenceImage = jest.fn(async (uri: string) => {
        if (uri === 'file:///guide.jpg') stopped = true;
        return 'Ynl0ZXM=';
      });

      await runImageGenerationTurn(
        { ...referenceEdit, ...callbacks },
        { generate, getUri: () => null, readReferenceImage, isStopped: () => stopped },
      );

      expect(readReferenceImage).toHaveBeenCalledTimes(2);
      expect(generate).not.toHaveBeenCalled();
    });

    it('does not report a failed read as a failure once the user has stopped', async () => {
      const callbacks = { ...createCallbacks(), onUnexpectedError: jest.fn() };
      let stopped = false;

      const outcome = await runImageGenerationTurn(
        { ...referenceEdit, ...callbacks },
        {
          generate: jest.fn(),
          getUri: () => null,
          readReferenceImage: async () => {
            stopped = true;
            throw new Error('read failed');
          },
          isStopped: () => stopped,
        },
      );

      expect(callbacks.fail).not.toHaveBeenCalled();
      expect(callbacks.onUnexpectedError).not.toHaveBeenCalled();
      expect(outcome.stopped).toBe(true);
    });

    it('does not present a result that lands after Stop', async () => {
      const callbacks = createCallbacks();
      let stopped = false;
      const generate = jest.fn(async () => {
        stopped = true;
        return {
          success: true,
          persisted: true,
          images: [{ url: '/api/files/00000000-0000-0000-0000-000000000005' }],
          model: 'registry-image-route',
        };
      });

      const outcome = await runImageGenerationTurn(
        { ...referenceEdit, ...callbacks },
        {
          generate,
          getUri: (image) => image?.url ?? null,
          readReferenceImage: async () => 'Ynl0ZXM=',
          isStopped: () => stopped,
        },
      );

      expect(callbacks.complete).not.toHaveBeenCalled();
      expect(outcome.stopped).toBe(true);
    });

    it('keeps the exact request, reference included, so Retry after Stop replays it', async () => {
      let stopped = false;
      await runImageGenerationTurn(
        { ...referenceEdit, ...createCallbacks() },
        {
          generate: jest.fn(),
          getUri: () => null,
          readReferenceImage: async () => {
            stopped = true;
            return 'Ynl0ZXM=';
          },
          isStopped: () => stopped,
        },
      );

      expect(takeImageEditRetry('assistant-1', 'default-test-account')).toEqual(referenceEdit);
    });

    it('does not remember a stopped plain generation as an edit', async () => {
      await runImageGenerationTurn(
        {
          conversationId: 'conversation-1',
          displayText: 'a cat',
          prompt: 'a cat',
          model: 'registry-image-route',
          ownerId: 'default-test-account',
          ...createCallbacks(),
        },
        { generate: jest.fn(), getUri: () => null, isStopped: () => true },
      );

      expect(takeImageEditRetry('assistant-1', 'default-test-account')).toBeNull();
    });

    it('still submits when nobody stopped the turn', async () => {
      const generate = jest.fn(async () => ({
        success: true,
        persisted: true,
        images: [{ url: '/api/files/00000000-0000-0000-0000-000000000006' }],
        model: 'registry-image-route',
      }));

      const outcome = await runImageGenerationTurn(
        { ...referenceEdit, ...createCallbacks() },
        {
          generate,
          getUri: (image) => image?.url ?? null,
          readReferenceImage: async () => 'Ynl0ZXM=',
          isStopped: () => false,
        },
      );

      expect(generate).toHaveBeenCalledTimes(1);
      expect(outcome).toEqual({ status: 'completed', assistantMessageId: 'assistant-1' });
    });
  });

  describe('retrying a failed edit', () => {
    const areaEdit = {
      conversationId: 'conversation-1',
      displayText: 'make this area blue',
      prompt: 'make this area blue',
      model: 'registry-image-route',
      operation: 'inpaint' as const,
      sourceImageBase64: 'c291cmNlLWJ5dGVz',
      maskImageBase64: 'bWFzay1ieXRlcw==',
      ownerId: 'default-test-account',
    };

    beforeEach(() => {
      clearCloudImageGenerationState();
    });

    async function failAreaEdit() {
      const callbacks = createCallbacks();
      const generate = jest.fn(async () => {
        throw new Error('provider unavailable');
      });
      const outcome = await runImageGenerationTurn(
        { ...areaEdit, ...callbacks },
        { generate, getUri: () => null },
      );
      expect(outcome).toEqual({ status: 'failed', assistantMessageId: 'assistant-1' });
    }

    it('hands back the exact source, mask and operation of a failed area edit', async () => {
      await failAreaEdit();

      expect(takeImageEditRetry('assistant-1', 'default-test-account')).toEqual(areaEdit);
    });

    it('hands back a failed change of shape with its ratio so Retry does not send the label as a prompt', async () => {
      const callbacks = createCallbacks();
      const reshape = {
        conversationId: 'conversation-1',
        displayText: 'Make it 3:2',
        prompt: 'a harbour at dusk',
        model: 'registry-image-route',
        aspectRatio: '3:2' as const,
        replayOnRetry: true as const,
        ownerId: 'default-test-account',
      };
      await runImageGenerationTurn(
        { ...reshape, ...callbacks },
        {
          generate: jest.fn(async () => {
            throw new Error('provider unavailable');
          }),
          getUri: () => null,
        },
      );

      expect(takeImageEditRetry('assistant-1', 'default-test-account')).toEqual(reshape);
    });

    it('replays the area edit as a contract-valid inpaint request', async () => {
      await failAreaEdit();
      const retry = takeImageEditRetry('assistant-1', 'default-test-account');
      const callbacks = createCallbacks();
      const generate = jest.fn(async () => ({
        success: true,
        persisted: true,
        images: [{ url: '/api/files/00000000-0000-0000-0000-000000000003' }],
        model: 'registry-image-route',
      }));

      await runImageGenerationTurn(
        { ...(retry as NonNullable<typeof retry>), ...callbacks },
        { generate, getUri: (image) => image?.url ?? null },
      );

      expect(generate).toHaveBeenCalledWith(
        {
          prompt: 'make this area blue',
          model: 'registry-image-route',
          operation: 'inpaint',
          source_image: { b64_json: 'c291cmNlLWJ5dGVz' },
          mask_image: { b64_json: 'bWFzay1ieXRlcw==' },
        },
        { operationId: 'assistant-1' },
      );
      expect(
        ManagedMediaImageGenerationRequestSchema.safeParse(generate.mock.calls[0]?.[0]).success,
      ).toBe(true);
    });

    it('hands a failed retry back only once and only to the account that ran it', async () => {
      await failAreaEdit();

      expect(takeImageEditRetry('assistant-1', 'another-account')).toBeNull();
      expect(takeImageEditRetry('assistant-1', 'default-test-account')).not.toBeNull();
      expect(takeImageEditRetry('assistant-1', 'default-test-account')).toBeNull();
    });

    it('forgets remembered edits when the Cloud account state is cleared', async () => {
      await failAreaEdit();
      clearCloudImageGenerationState();

      expect(takeImageEditRetry('assistant-1', 'default-test-account')).toBeNull();
    });

    it('remembers a failed reference edit with its ordered guide images', async () => {
      const callbacks = createCallbacks();
      const edit = {
        conversationId: 'conversation-1',
        displayText: 'blend these',
        prompt: 'blend these',
        model: 'registry-image-route',
        operation: 'edit' as const,
        sourceImage: { uri: 'file:///a.jpg', mimeType: 'image/jpeg', fileName: 'a.jpg' },
        referenceImages: [
          { uri: 'file:///b.jpg', mimeType: 'image/jpeg', fileName: 'b.jpg' },
          { uri: 'file:///c.jpg', mimeType: 'image/jpeg', fileName: 'c.jpg' },
        ],
        ownerId: 'default-test-account',
      };

      await runImageGenerationTurn(
        { ...edit, ...callbacks },
        {
          generate: jest.fn(async () => {
            throw new Error('provider unavailable');
          }),
          getUri: () => null,
          readReferenceImage: async () => 'Ynl0ZXM=',
        },
      );

      expect(takeImageEditRetry('assistant-1', 'default-test-account')).toEqual(edit);
    });

    it('does not remember a failed plain generation, a completed edit or a refused paywall edit', async () => {
      const plain = createCallbacks();
      await runImageGenerationTurn(
        {
          conversationId: 'conversation-1',
          displayText: 'a cat',
          prompt: 'a cat',
          model: 'registry-image-route',
          ownerId: 'default-test-account',
          ...plain,
        },
        {
          generate: jest.fn(async () => {
            throw new Error('provider unavailable');
          }),
          getUri: () => null,
        },
      );
      expect(takeImageEditRetry('assistant-1', 'default-test-account')).toBeNull();

      await runImageGenerationTurn(
        { ...areaEdit, ...createCallbacks() },
        {
          generate: jest.fn(async () => ({
            success: true,
            persisted: true,
            images: [{ url: '/api/files/00000000-0000-0000-0000-000000000004' }],
            model: 'registry-image-route',
          })),
          getUri: (image) => image?.url ?? null,
        },
      );
      expect(takeImageEditRetry('assistant-1', 'default-test-account')).toBeNull();

      await runImageGenerationTurn(
        { ...areaEdit, ...createCallbacks() },
        {
          generate: jest.fn(async () => {
            throw new ApiPaywallError('image_quota', 'pro', 'Monthly image limit reached');
          }),
          getUri: () => null,
        },
      );
      expect(takeImageEditRetry('assistant-1', 'default-test-account')).toBeNull();
    });
  });
});

describe('a failed picture in the chat', () => {
  const SAFETY_SENTENCE =
    'Your prompt was flagged by our content safety filters. Please try a different prompt.';

  function failTurn(response: ImageGenResponse) {
    const callbacks = createCallbacks();
    const outcome = runImageGenerationTurn(
      {
        conversationId: 'conversation-1',
        displayText: '/image a red circle on white',
        prompt: 'a red circle on white',
        model: 'registry-image-route',
        ownerId: 'default-test-account',
        ...callbacks,
      },
      { generate: async () => response, getUri: () => null },
    );
    return { callbacks, outcome };
  }

  beforeEach(() => {
    mockMmkvValues.clear();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('default-test-account');
    clearCloudImageGenerationState();
  });

  it('says the sentence the server wrote for a refused job', async () => {
    const { callbacks, outcome } = failTurn({
      success: false,
      status: 'failed',
      job_id: 'job-1',
      retryable: false,
      error: SAFETY_SENTENCE,
    });

    await expect(outcome).resolves.toEqual({ status: 'failed', assistantMessageId: 'assistant-1' });
    expect(callbacks.fail).toHaveBeenCalledWith('conversation-1', 'assistant-1', SAFETY_SENTENCE);
  });

  it('says the server sentence for a failure another try can pass', async () => {
    const { callbacks, outcome } = failTurn({
      success: false,
      status: 'failed',
      retryable: true,
      error: 'The image generation service is temporarily busy. Please try again in a few moments.',
    });

    await outcome;
    expect(callbacks.fail).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
      'The image generation service is temporarily busy. Please try again in a few moments.',
    );
  });

  it('says the server sentence when the server says nothing about trying again', async () => {
    const { callbacks, outcome } = failTurn({
      success: false,
      status: 'failed',
      error: SAFETY_SENTENCE,
    });

    await outcome;
    expect(callbacks.fail).toHaveBeenCalledWith('conversation-1', 'assistant-1', SAFETY_SENTENCE);
  });

  it('keeps the generic sentence when the server sends no sentence', async () => {
    const { callbacks, outcome } = failTurn({ success: false, status: 'failed', error: '  ' });

    await outcome;
    expect(callbacks.fail).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
      'AGI Cloud did not return an image. Try again.',
    );
  });

  it('does not show an error string that does not come from a failed job', async () => {
    const { callbacks, outcome } = failTurn({
      success: false,
      retryable: false,
      error: 'Provider unavailable at /private/route',
    });

    await outcome;
    expect(callbacks.fail).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
      'AGI Cloud did not return an image. Try again.',
    );
  });
});

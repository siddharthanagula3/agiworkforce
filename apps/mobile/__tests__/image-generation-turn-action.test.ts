const mockMmkvValues = new Map<string, string>();
jest.mock('../lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mockMmkvValues.get(key),
    set: (key: string, value: string) => mockMmkvValues.set(key, value),
    delete: (key: string) => mockMmkvValues.delete(key),
  },
}));

import { ApiPaywallError } from '../services/api';
import { runImageGenerationTurn } from '../src/features/chat/actions/runImageGenerationTurn';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

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
    const callbacks = { ...createCallbacks(), onUnexpectedError: jest.fn() };
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
    expect(generate).not.toHaveBeenCalled();
    expect(callbacks.onUnexpectedError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Sign in to an active AGI Cloud account before generating an image.',
      }),
    );
  });

  it('fails closed when the request owner does not match the active Cloud account', async () => {
    activateCloudAccount('account-a');
    const callbacks = { ...createCallbacks(), onUnexpectedError: jest.fn() };
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
    expect(generate).not.toHaveBeenCalled();
    expect(callbacks.onUnexpectedError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'The active AGI Cloud account changed before image generation started.',
      }),
    );
  });

  it('owns the shared begin, provider call, and completion mechanics', async () => {
    const callbacks = createCallbacks();
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

    expect(generate).toHaveBeenCalledWith({
      prompt: 'Create an image of Mars',
      model: 'registry-image-route',
    });
    expect(callbacks.begin).toHaveBeenCalledWith(
      'conversation-1',
      'Create an image of Mars',
      'Create an image of Mars',
      'registry-image-route',
    );
    expect(callbacks.complete).toHaveBeenCalledWith('conversation-1', 'assistant-1', {
      imageUrl: 'https://example.com/generated.png',
      persisted: false,
      persistenceWarning:
        'This image is available for this session only because AGI Cloud media storage is not configured. Try again after storage is available to save it.',
      revisedPrompt: 'Refined prompt',
      model: 'registry-image-route',
    });
    expect(callbacks.fail).not.toHaveBeenCalled();
    expect(outcome).toEqual({ status: 'completed', assistantMessageId: 'assistant-1' });
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
        generate: async () => ({ success: false, error: 'Provider unavailable' }),
        getUri: () => null,
      },
    );

    expect(callbacks.fail).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
      'Provider unavailable',
    );
    expect(outcome).toEqual({ status: 'failed', assistantMessageId: 'assistant-1' });
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
});

import { ApiPaywallError } from '../services/api';
import { runImageGenerationTurn } from '../src/features/chat/actions/runImageGenerationTurn';

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
});

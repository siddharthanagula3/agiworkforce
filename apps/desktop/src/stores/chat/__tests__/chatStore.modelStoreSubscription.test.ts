import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getModelContextWindow } from '../../../constants/llm';

const CHAT_STORE_MODEL_SUBSCRIPTION_STATE = Symbol.for(
  'agiworkforce.chatStore.modelStoreSubscriptionState',
);

function resetChatStoreModelSubscriptionState() {
  const globalScope = globalThis as typeof globalThis & {
    [CHAT_STORE_MODEL_SUBSCRIPTION_STATE]?: {
      unsubscribe?: (() => void) | null;
    };
  };

  globalScope[CHAT_STORE_MODEL_SUBSCRIPTION_STATE]?.unsubscribe?.();
  delete globalScope[CHAT_STORE_MODEL_SUBSCRIPTION_STATE];
}

describe('chatStore modelStore subscription', () => {
  beforeEach(() => {
    vi.resetModules();
    resetChatStoreModelSubscriptionState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unmock('../../modelStore');
    resetChatStoreModelSubscriptionState();
  });

  it('does not warn when modelStore lacks subscribe', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.doMock('../../modelStore', () => ({
      useModelStore: {
        getState: () => ({ selectedModel: 'gpt-5.4' }),
      },
    }));

    const { initializeChatStoreModelStoreSubscription, useChatStore } =
      await import('../chatStore');
    await initializeChatStoreModelStoreSubscription();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(useChatStore.getState().tokenUsage.max).toBeGreaterThan(0);
  });

  it('subscribes to model changes when the API is available', async () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(
      (
        _selector: (state: { selectedModel: string | null }) => string | null,
        listener: (selectedModel: string | null) => void,
      ) => {
        listener('gpt-5.4');
        return unsubscribe;
      },
    );

    vi.doMock('../../modelStore', () => ({
      useModelStore: {
        getState: () => ({ selectedModel: 'gpt-5.4' }),
        subscribe,
      },
    }));

    const { initializeChatStoreModelStoreSubscription, useChatStore } =
      await import('../chatStore');
    await initializeChatStoreModelStoreSubscription();

    expect(subscribe).toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(useChatStore.getState().tokenUsage.max).toBe(getModelContextWindow('gpt-5.4'));
  });

  it('does not auto-initialize the subscription on import in test mode', async () => {
    const subscribe = vi.fn(() => vi.fn());

    vi.doMock('../../modelStore', () => ({
      useModelStore: {
        getState: () => ({ selectedModel: 'gpt-5.4' }),
        subscribe,
      },
    }));

    await import('../chatStore');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(subscribe).not.toHaveBeenCalled();
  });
});

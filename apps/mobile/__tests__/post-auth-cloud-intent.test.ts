import { useTierStore } from '../src/features/billing/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import {
  DEFAULT_LOCAL_MODEL_ID,
  getDefaultCloudModelIdForTier,
} from '../src/features/model-picker/service';
import { useModelStore } from '../src/features/model-picker/store';
import { useWaitlistStore } from '../src/features/waitlist/store';
import {
  applyPostAuthIntentAfterSignIn,
  completePendingPostAuthIntentForLoadedSession,
  resetPostAuthDestinationToLocal,
} from '../src/features/auth/actions/postAuthIntent';
import {
  beginCloudPostAuthIntent,
  clearPostAuthIntent,
  CLOUD_CHAT_POST_AUTH_INTENT,
  consumePostAuthIntent,
  parsePostAuthIntent,
  peekPostAuthIntent,
  POST_AUTH_INTENT_PARAM,
  stagePostAuthIntent,
} from '../src/features/auth/services/postAuthIntent';

describe('post-auth Cloud intent', () => {
  beforeEach(() => {
    clearPostAuthIntent();
    useWaitlistStore.getState().setCloudAccess(false);
    useTierStore.getState().setTier('free');
    resetPostAuthDestinationToLocal();
  });

  it('accepts only the exact supported route value', () => {
    expect(parsePostAuthIntent(CLOUD_CHAT_POST_AUTH_INTENT)).toBe(CLOUD_CHAT_POST_AUTH_INTENT);
    expect(parsePostAuthIntent(['cloud-chat'])).toBeNull();
    expect(parsePostAuthIntent('cloud')).toBeNull();
    expect(parsePostAuthIntent(undefined)).toBeNull();
  });

  it('stages an explicit route intent and consumes it only once', () => {
    const href = beginCloudPostAuthIntent();

    expect(href).toEqual({
      pathname: '/(auth)/login',
      params: { [POST_AUTH_INTENT_PARAM]: CLOUD_CHAT_POST_AUTH_INTENT },
    });
    expect(peekPostAuthIntent()).toBe(CLOUD_CHAT_POST_AUTH_INTENT);
    expect(consumePostAuthIntent()).toBe(CLOUD_CHAT_POST_AUTH_INTENT);
    expect(consumePostAuthIntent()).toBeNull();
  });

  it('clears a stale intent when a default or malformed login replaces it', () => {
    beginCloudPostAuthIntent();

    expect(stagePostAuthIntent('not-supported')).toBeNull();
    expect(peekPostAuthIntent()).toBeNull();
  });

  it('reports whether cancellation cleared a pending intent', () => {
    beginCloudPostAuthIntent();

    expect(clearPostAuthIntent()).toBe(true);
    expect(clearPostAuthIntent()).toBe(false);
  });

  it('selects the catalog-derived tier default before entering Cloud', () => {
    const tier = useTierStore.getState().tier;
    const expectedModelId = getDefaultCloudModelIdForTier(tier);
    expect(expectedModelId).toBeDefined();

    // ClerkTokenBridge grants this signed-in entitlement before applying the
    // intent; model-store validation must still reject Cloud ids before it.
    useWaitlistStore.getState().setCloudAccess(true);
    const applied = applyPostAuthIntentAfterSignIn(CLOUD_CHAT_POST_AUTH_INTENT, tier);

    expect(applied).toBe(true);
    expect(useModelStore.getState().selectedModel).toBe(expectedModelId);
    expect(useChatAppModeStore.getState().appMode).toBe('cloud');
  });

  it('leaves a signed-out intent staged for the Clerk bridge', () => {
    beginCloudPostAuthIntent();

    const completed = completePendingPostAuthIntentForLoadedSession({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      cloudUnlocked: false,
      subscriptionTier: useTierStore.getState().tier,
    });

    expect(completed).toBe(false);
    expect(peekPostAuthIntent()).toBe(CLOUD_CHAT_POST_AUTH_INTENT);
    expect(useChatAppModeStore.getState().appMode).toBe('local');
  });

  it('keeps cancel/default handling in Local mode', () => {
    useWaitlistStore.getState().setCloudAccess(true);
    const cloudDefault = getDefaultCloudModelIdForTier(useTierStore.getState().tier);
    expect(cloudDefault).toBeDefined();
    if (cloudDefault) useModelStore.getState().setModel(cloudDefault);
    useChatAppModeStore.getState().setAppMode('cloud');

    resetPostAuthDestinationToLocal();

    expect(useChatAppModeStore.getState().appMode).toBe('local');
    expect(useModelStore.getState().selectedModel).toBe(DEFAULT_LOCAL_MODEL_ID);
  });
});

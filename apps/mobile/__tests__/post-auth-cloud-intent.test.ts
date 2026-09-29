import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  beginCloudPostAuthIntentForDestination,
  clearPostAuthIntent,
  CLOUD_CHAT_POST_AUTH_INTENT,
  consumePostAuthIntent,
  consumePostAuthDestination,
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
    expect(parsePostAuthIntent('cloud-schedules')).toBe('cloud-schedules');
    expect(parsePostAuthIntent('cloud-tasks')).toBe('cloud-tasks');
    expect(parsePostAuthIntent('/(app)/settings/cloud-billing')).toBeNull();
  });

  it.each([
    ['/(app)/settings/cloud-account', 'cloud-account'],
    ['/(app)/settings/account-security', 'cloud-account-security'],
    ['/(app)/settings/cloud-billing', 'cloud-billing'],
    ['/(app)/settings/shared-links', 'cloud-shared-links'],
    ['/(app)/settings/workspace', 'cloud-workspace'],
    ['/(app)/settings/reflect', 'cloud-reflect'],
    ['/(app)/settings/archived-chats', 'cloud-archived-chats'],
    ['/(app)/settings/cloud-privacy', 'cloud-privacy'],
    ['/(app)/settings/cloud-usage', 'cloud-usage'],
    ['/(app)/settings/cloud-connectors', 'cloud-connectors'],
  ] as const)('returns to %s after Cloud sign-in', (destination, intent) => {
    expect(beginCloudPostAuthIntentForDestination(destination).params.postAuthIntent).toBe(intent);
    useWaitlistStore.getState().setCloudAccess(true);
    expect(
      completePendingPostAuthIntentForLoadedSession({
        isLoaded: true,
        isSignedIn: true,
        userId: 'person-a',
        termsAccepted: true,
        cloudUnlocked: true,
        subscriptionTier: 'free',
      }),
    ).toBe(true);
    expect(consumePostAuthDestination()).toBe(destination);
  });

  it('restores the requested Cloud feature only after the authenticated gate passes', () => {
    const href = beginCloudPostAuthIntent('cloud-schedules');
    expect(href.params.postAuthIntent).toBe('cloud-schedules');

    expect(
      completePendingPostAuthIntentForLoadedSession({
        isLoaded: true,
        isSignedIn: true,
        userId: 'person-a',
        termsAccepted: false,
        cloudUnlocked: false,
        subscriptionTier: 'free',
      }),
    ).toBe(false);
    expect(consumePostAuthDestination()).toBeNull();

    useWaitlistStore.getState().setCloudAccess(true);
    expect(
      completePendingPostAuthIntentForLoadedSession({
        isLoaded: true,
        isSignedIn: true,
        userId: 'person-a',
        termsAccepted: true,
        cloudUnlocked: true,
        subscriptionTier: 'free',
      }),
    ).toBe(true);
    expect(useChatAppModeStore.getState().appMode).toBe('cloud');
    expect(consumePostAuthDestination()).toBe('/(app)/schedules');
    expect(consumePostAuthDestination()).toBeNull();
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
      termsAccepted: false,
      cloudUnlocked: false,
      subscriptionTier: useTierStore.getState().tier,
    });

    expect(completed).toBe(false);
    expect(peekPostAuthIntent()).toBe(CLOUD_CHAT_POST_AUTH_INTENT);
    expect(useChatAppModeStore.getState().appMode).toBe('local');
  });

  it('does not consume a signed-in Cloud intent before Terms acceptance', () => {
    beginCloudPostAuthIntent();

    expect(
      completePendingPostAuthIntentForLoadedSession({
        isLoaded: true,
        isSignedIn: true,
        userId: 'terms-pending-owner',
        termsAccepted: false,
        cloudUnlocked: true,
        subscriptionTier: useTierStore.getState().tier,
      }),
    ).toBe(false);
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

describe('NEW-mqa-05, every Cloud entry point stages the intent', () => {
  const entryPoints = [
    'app/(app)/chat/[id].tsx',
    'app/(app)/(tabs)/chat.tsx',
    'app/(public)/onboarding.tsx',
    'app/(app)/schedules/index.tsx',
    'app/(app)/schedules/create.tsx',
    'app/(app)/models.tsx',
    'src/features/tasks/CloudTasksScreen.tsx',
    'src/features/compare/index.tsx',
    'src/features/skills/SkillsScreen.tsx',
  ];

  it.each(entryPoints)(
    'routes %s through beginCloudPostAuthIntent, not a bare login push',
    (file) => {
      const source = readFileSync(join(__dirname, '..', file), 'utf8');

      expect(source).toContain('beginCloudPostAuthIntent');
      // A bare push to the auth stack signs the user in and leaves them in Local
      // Mode, which is the defect this guards.
      expect(source).not.toMatch(/push\(\s*'\/\(auth\)\/login'/);
      expect(source).not.toMatch(/replace\(\s*'\/\(auth\)\/login'/);
    },
  );
});

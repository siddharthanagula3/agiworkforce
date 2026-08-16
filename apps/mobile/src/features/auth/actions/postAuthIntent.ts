import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  DEFAULT_LOCAL_MODEL_ID,
  getDefaultCloudModelIdForTier,
} from '@/src/features/model-picker/service';
import { useModelStore } from '@/src/features/model-picker/store';
import {
  CLOUD_CHAT_POST_AUTH_INTENT,
  consumePostAuthIntent,
  type PostAuthIntent,
} from '../services/postAuthIntent';

export function resetPostAuthDestinationToLocal(): void {
  useModelStore.getState().setModel(DEFAULT_LOCAL_MODEL_ID);
  useChatAppModeStore.getState().setAppMode('local');
}

export function applyPostAuthIntentAfterSignIn(
  intent: PostAuthIntent,
  subscriptionTier: string,
): boolean {
  if (intent !== CLOUD_CHAT_POST_AUTH_INTENT) {
    resetPostAuthDestinationToLocal();
    return false;
  }

  const defaultCloudModelId = getDefaultCloudModelIdForTier(subscriptionTier);
  if (!defaultCloudModelId) {
    resetPostAuthDestinationToLocal();
    return false;
  }

  useModelStore.getState().setModel(defaultCloudModelId);
  if (useModelStore.getState().selectedModel !== defaultCloudModelId) {
    resetPostAuthDestinationToLocal();
    return false;
  }

  useChatAppModeStore.getState().setAppMode('cloud');
  return true;
}

interface LoadedCloudSession {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null | undefined;
  cloudUnlocked: boolean;
  subscriptionTier: string;
}

export function completePendingPostAuthIntentForLoadedSession({
  isLoaded,
  isSignedIn,
  userId,
  cloudUnlocked,
  subscriptionTier,
}: LoadedCloudSession): boolean {
  if (!isLoaded || !isSignedIn || !userId || !cloudUnlocked) return false;

  const intent = consumePostAuthIntent();
  if (!intent) return false;
  return applyPostAuthIntentAfterSignIn(intent, subscriptionTier);
}

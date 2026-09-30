import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  DEFAULT_LOCAL_MODEL_ID,
  getDefaultCloudModelIdForTier,
} from '@/src/features/model-picker/service';
import { useModelStore } from '@/src/features/model-picker/store';
import {
  consumePostAuthIntent,
  stagePostAuthDestination,
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
  termsAccepted: boolean;
  cloudUnlocked: boolean;
  subscriptionTier: string;
}

export function completePendingPostAuthIntentForLoadedSession({
  isLoaded,
  isSignedIn,
  userId,
  termsAccepted,
  cloudUnlocked,
  subscriptionTier,
}: LoadedCloudSession): boolean {
  if (!isLoaded || !isSignedIn || !userId || !termsAccepted || !cloudUnlocked) return false;

  const intent = consumePostAuthIntent();
  if (!intent) return false;
  const completed = applyPostAuthIntentAfterSignIn(intent, subscriptionTier);
  if (completed) stagePostAuthDestination(intent);
  return completed;
}

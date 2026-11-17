import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  getDefaultCloudModelIdForTier,
  isAutoMode,
  isCloudManagedModelId,
} from '@/src/features/model-picker/service';
import { useModelStore } from '@/src/features/model-picker/store';
import {
  consumePostAuthIntent,
  stagePostAuthDestination,
  type PostAuthIntent,
} from '../services/postAuthIntent';
import { isCloudAccountAdditionOpenFor } from '../services/accountAddition';

export function resetPostAuthDestinationToLocal(): void {
  useChatAppModeStore.getState().setAppMode('local');
  useModelStore.getState().restoreNewChatModel();
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

  useChatAppModeStore.getState().setAppMode('cloud');
  useModelStore.getState().restoreNewChatModel();
  const { selectedModel } = useModelStore.getState();
  if (!isCloudManagedModelId(selectedModel) && !isAutoMode(selectedModel)) {
    resetPostAuthDestinationToLocal();
    return false;
  }

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
  if (isCloudAccountAdditionOpenFor(userId)) return false;

  const intent = consumePostAuthIntent();
  if (!intent) return false;
  const completed = applyPostAuthIntentAfterSignIn(intent, subscriptionTier);
  if (completed) stagePostAuthDestination(intent);
  return completed;
}

import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useChatStore } from '@/stores/chatStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTierStore } from '@/src/features/billing/store';
import { useModelStore } from '@/src/features/model-picker/store';
import {
  DEFAULT_CLOUD_MODEL_ID,
  DEFAULT_LOCAL_MODEL_ID,
  getDefaultCloudModelIdForTier,
} from '@/src/features/model-picker/service';
import { readyLocalModelIdOr } from '@/src/features/model-picker/installStore';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { FEATURES } from '@/lib/v1FeatureFlags';

export function useAppModeSwitch() {
  const router = useRouter();
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const subscriptionTier = useTierStore((s) => s.tier);
  const setModel = useModelStore((s) => s.setModel);
  const setWorkMode = useChatStore((s) => s.setWorkMode);

  const switchToLocal = useCallback((): boolean => {
    setWorkMode('chat');
    setAppMode('local');
    setModel(readyLocalModelIdOr(DEFAULT_LOCAL_MODEL_ID));
    return true;
  }, [setAppMode, setModel, setWorkMode]);

  const switchToCloud = useCallback((): boolean => {
    if (!FEATURES.cloudChat || !DEFAULT_CLOUD_MODEL_ID) {
      setAppMode('local');
      return false;
    }
    if (!cloudUnlocked) {
      router.push(beginCloudPostAuthIntent());
      return false;
    }
    setAppMode('cloud');
    setModel(getDefaultCloudModelIdForTier(subscriptionTier) ?? DEFAULT_CLOUD_MODEL_ID);
    return true;
  }, [cloudUnlocked, router, setAppMode, setModel, subscriptionTier]);

  return { appMode, cloudUnlocked, switchToLocal, switchToCloud };
}

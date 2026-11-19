import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useChatStore } from '@/stores/chatStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useModelStore } from '@/src/features/model-picker/store';
import { DEFAULT_CLOUD_MODEL_ID } from '@/src/features/model-picker/service';
import { readyLocalModelIdOr } from '@/src/features/model-picker/installStore';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { FEATURES } from '@/lib/v1FeatureFlags';

export function useAppModeSwitch() {
  const router = useRouter();
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const setModel = useModelStore((s) => s.setModel);
  const restoreNewChatModel = useModelStore((s) => s.restoreNewChatModel);
  const setWorkMode = useChatStore((s) => s.setWorkMode);

  const switchToLocal = useCallback((): boolean => {
    setWorkMode('chat');
    setAppMode('local');
    restoreNewChatModel();
    const remembered = useModelStore.getState().selectedModel;
    const ready = readyLocalModelIdOr(remembered);
    if (ready !== remembered) setModel(ready);
    return true;
  }, [restoreNewChatModel, setAppMode, setModel, setWorkMode]);

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
    if (useChatAppModeStore.getState().appMode !== 'cloud') return false;
    restoreNewChatModel();
    return true;
  }, [cloudUnlocked, restoreNewChatModel, router, setAppMode]);

  return { appMode, cloudUnlocked, switchToLocal, switchToCloud };
}

import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/features/auth/store';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';

export interface CloudCodeAccess {
  ready: boolean;
  signedIn: boolean;
  accountKey: string;
  activate: () => void;
}

export function useCloudCodeAccess(): CloudCodeAccess {
  const router = useRouter();
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);
  const cloudUnlocked = useWaitlistStore((state) => state.cloudUnlocked);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);

  const activate = useCallback(() => {
    if (!cloudUnlocked) {
      router.push(beginCloudPostAuthIntent('cloud-code'));
      return;
    }
    setAppMode('cloud');
  }, [cloudUnlocked, router, setAppMode]);

  return {
    ready: appMode === 'cloud' && cloudUnlocked,
    signedIn: cloudUnlocked,
    accountKey: clerkUserId ?? 'signed-out',
    activate,
  };
}

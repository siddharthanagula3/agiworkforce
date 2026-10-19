import { useCallback } from 'react';
import { useRouter } from 'expo-router';

import { useAuthStore } from '@/src/features/auth/store';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

export interface CloudFeatureAccess {
  ready: boolean;
  signedIn: boolean;
  ownerId: string | null;
  continueToCloud: () => void;
}

export function useCloudFeatureAccess(): CloudFeatureAccess {
  const router = useRouter();
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);
  const isClerkLoaded = useAuthStore((state) => state.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);

  const continueToCloud = useCallback(() => {
    if (!isClerkSignedIn) {
      router.push(beginCloudPostAuthIntent());
      return;
    }
    setAppMode('cloud');
  }, [isClerkSignedIn, router, setAppMode]);

  return {
    ready: isClerkLoaded && isClerkSignedIn && appMode === 'cloud' && Boolean(clerkUserId),
    signedIn: isClerkSignedIn,
    ownerId: clerkUserId ?? null,
    continueToCloud,
  };
}

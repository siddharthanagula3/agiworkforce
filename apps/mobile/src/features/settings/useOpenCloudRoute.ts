import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/features/auth/store';
import {
  beginCloudPostAuthIntentForDestination,
  type PostAuthDestination,
} from '@/src/features/auth/services/postAuthIntent';

export function useOpenCloudRoute() {
  const router = useRouter();
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);

  return useCallback(
    (path: PostAuthDestination) => () => {
      if (!isClerkLoaded) return;
      if (!isClerkSignedIn) {
        router.push(beginCloudPostAuthIntentForDestination(path));
        return;
      }
      router.push(path as Parameters<typeof router.push>[0]);
    },
    [isClerkLoaded, isClerkSignedIn, router],
  );
}

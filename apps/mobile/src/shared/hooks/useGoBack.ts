import { useCallback } from 'react';
import { useRouter } from 'expo-router';

// A screen reachable from more than one parent cannot name its caller, so the
// href only answers a deep link that arrived with no history behind it.
export function useGoBack(fallbackHref: string): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate(fallbackHref as Parameters<typeof router.navigate>[0]);
  }, [fallbackHref, router]);
}

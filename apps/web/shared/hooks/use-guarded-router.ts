'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { confirmNavigation } from '@agiworkforce/ui';

export function useGuardedRouter(): ReturnType<typeof useRouter> {
  const router = useRouter();
  return useMemo(
    () => ({
      ...router,
      push: (...args: Parameters<typeof router.push>) =>
        confirmNavigation(() => router.push(...args)),
      replace: (...args: Parameters<typeof router.replace>) =>
        confirmNavigation(() => router.replace(...args)),
      back: () => confirmNavigation(() => router.back()),
      forward: () => confirmNavigation(() => router.forward()),
    }),
    [router],
  );
}

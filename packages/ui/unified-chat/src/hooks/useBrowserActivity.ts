'use client';

import { useSyncExternalStore } from 'react';
import { isBrowserUserActive, subscribeBrowserActivity } from '@agiworkforce/client-runtime';

const serverActivity = () => false;

export function useBrowserActivity(): boolean {
  return useSyncExternalStore(subscribeBrowserActivity, isBrowserUserActive, serverActivity);
}

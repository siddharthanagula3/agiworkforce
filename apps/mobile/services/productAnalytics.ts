import {
  createAccountProductAnalytics,
  type ProductAnalyticsEmitter,
  type ProductAnalyticsEventName,
  type ProductAnalyticsOutcome,
  type ProductAnalyticsProperties,
} from '@agiworkforce/types';
import { AppState } from 'react-native';

import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

import { apiFetch } from './api';

let analytics: ProductAnalyticsEmitter | null = null;

async function requestAccountJson(
  path: string,
  init?: { method: 'POST'; body: string },
): Promise<unknown> {
  const response = await apiFetch(path, {
    method: init?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(init ? { body: init.body } : {}),
  });
  return response.ok ? response.json() : null;
}

function getAnalytics(): ProductAnalyticsEmitter {
  if (analytics) return analytics;
  const created = createAccountProductAnalytics({
    surface: 'mobile',
    isEnabled: () => useChatAppModeStore.getState().appMode === 'cloud',
    request: requestAccountJson,
  });
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') void created.flush();
  });
  analytics = created;
  return created;
}

export function trackProductEvent(
  name: ProductAnalyticsEventName,
  input?: { outcome?: ProductAnalyticsOutcome; properties?: ProductAnalyticsProperties },
): void {
  getAnalytics().track(name, input);
}

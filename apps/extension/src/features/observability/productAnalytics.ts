import {
  createAccountProductAnalytics,
  type ProductAnalyticsEventName,
  type ProductAnalyticsOutcome,
  type ProductAnalyticsProperties,
} from '@agiworkforce/types';

import type { ConversationRuntime } from '../background/conversation-history';
import { FREE_TRIAL_GATEWAY, getAuthToken } from '../cloud-bridge/freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';

async function requestAccountJson(
  path: string,
  init?: { method: 'POST'; body: string },
): Promise<unknown> {
  const token = await getAuthToken();
  if (!token) return null;
  const response = await fetch(`${FREE_TRIAL_GATEWAY}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
    },
    ...(init ? { body: init.body } : {}),
  });
  return response.ok ? response.json() : null;
}

const analytics = createAccountProductAnalytics({
  surface: 'chrome',
  isEnabled: () => true,
  request: requestAccountJson,
});

export function trackProductEvent(
  name: ProductAnalyticsEventName,
  runtime: ConversationRuntime | undefined,
  input?: { outcome?: ProductAnalyticsOutcome; properties?: ProductAnalyticsProperties },
): void {
  if (runtime !== 'managed-cloud') return;
  analytics.track(name, input);
}

export function flushProductEvents(): Promise<void> {
  return analytics.flush();
}

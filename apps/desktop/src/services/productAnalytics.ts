import {
  PRODUCT_ANALYTICS_INGEST_PATH,
  createProductAnalyticsEmitter,
  type ProductAnalyticsEmitter,
  type ProductAnalyticsEvent,
  type ProductAnalyticsEventName,
  type ProductAnalyticsOutcome,
} from '@agiworkforce/types';

import { CLOUD_API_BASE_URL, cloudFetch, getAuthHeaders } from '../api/cloudApi';
import { isPrivateTrustBoundary } from '../stores/privacyBoundary';
import type { EventName } from '../types/analytics';

/**
 * Desktop telemetry stays local: `analyticsTrackEvent` writes to this machine.
 * The product event stream is the account's, shared with every other surface,
 * so it rides the Managed Cloud transport the app already holds and is gated by
 * the same account consent the web ingest reads, not by a local switch.
 */
async function postEvents(events: readonly ProductAnalyticsEvent[]): Promise<void> {
  const headers = await getAuthHeaders();
  await cloudFetch(`${CLOUD_API_BASE_URL}${PRODUCT_ANALYTICS_INGEST_PATH}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ events }),
  });
}

let emitter: ProductAnalyticsEmitter | null = null;

function getEmitter(): ProductAnalyticsEmitter {
  emitter ??= createProductAnalyticsEmitter({
    surface: 'desktop',
    isAllowed: () => !isPrivateTrustBoundary(),
    send: (events) => postEvents(events).catch(() => undefined),
  });
  return emitter;
}

interface MappedProductEvent {
  readonly name: ProductAnalyticsEventName;
  readonly outcome?: ProductAnalyticsOutcome;
}

const DESKTOP_PRODUCT_EVENTS: Partial<Record<EventName, MappedProductEvent>> = {
  file_uploaded: { name: 'file_uploaded' },
  browser_automation_started: { name: 'browser_session_started' },
  browser_automation_completed: { name: 'browser_action_finished', outcome: 'succeeded' },
  goal_submitted: { name: 'work_started' },
  goal_completed: { name: 'work_run_finished', outcome: 'succeeded' },
  goal_failed: { name: 'work_run_finished', outcome: 'failed' },
  subscription_upgraded: { name: 'plan_changed' },
  subscription_downgraded: { name: 'plan_changed' },
  subscription_cancelled: { name: 'plan_changed' },
};

export function productEventForDesktopEvent(name: EventName): MappedProductEvent | undefined {
  return DESKTOP_PRODUCT_EVENTS[name];
}

export function trackDesktopProductEvent(name: EventName): void {
  const mapped = productEventForDesktopEvent(name);
  if (!mapped) return;
  getEmitter().track(mapped.name, mapped.outcome ? { outcome: mapped.outcome } : undefined);
}

export function flushDesktopProductEvents(): Promise<void> {
  return emitter ? emitter.flush() : Promise.resolve();
}

import {
  PRODUCT_ANALYTICS_INGEST_PATH,
  createProductAnalyticsEmitter,
  type ProductAnalyticsEmitter,
  type ProductAnalyticsEvent,
  type ProductAnalyticsEventName,
  type ProductAnalyticsOutcome,
  type ProductAnalyticsProperties,
} from '@agiworkforce/types';

import { addCsrfHeaders } from '@/lib/client/csrf';
import { isAnalyticsAllowed, readCookiePreferences } from '@shared/lib/cookie-consent';

const FLUSH_INTERVAL_MS = 15_000;

async function postEvents(events: readonly ProductAnalyticsEvent[]): Promise<void> {
  const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
  await fetch(PRODUCT_ANALYTICS_INGEST_PATH, {
    method: 'POST',
    headers,
    credentials: 'same-origin',
    keepalive: true,
    body: JSON.stringify({ events }),
  });
}

function createEmitter(): ProductAnalyticsEmitter {
  return createProductAnalyticsEmitter({
    surface: 'web',
    isAllowed: () => isAnalyticsAllowed(readCookiePreferences()),
    send: (events) =>
      postEvents(events).catch(() => {
        // An analytics post is never worth an error a reader sees, and the
        // events it carried are not worth retrying into a second one.
      }),
  });
}

let emitter: ProductAnalyticsEmitter | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function getEmitter(): ProductAnalyticsEmitter {
  emitter ??= createEmitter();
  if (!timer && typeof window !== 'undefined') {
    timer = setInterval(() => void emitter?.flush(), FLUSH_INTERVAL_MS);
    window.addEventListener('pagehide', () => void emitter?.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void emitter?.flush();
    });
  }
  return emitter;
}

export function trackProductEvent(
  name: ProductAnalyticsEventName,
  input?: { outcome?: ProductAnalyticsOutcome; properties?: ProductAnalyticsProperties },
): void {
  if (typeof window === 'undefined') return;
  getEmitter().track(name, input);
}

export function flushProductEvents(): Promise<void> {
  return emitter ? emitter.flush() : Promise.resolve();
}

import { getCsrfToken } from '@/lib/client/csrf';
import type { NotificationFeedResponse } from './notification-target';

export const NOTIFICATION_FEED_ENDPOINT = '/api/notifications';
export const NOTIFICATION_FEED_PAGE_SIZE = 20;

export async function fetchNotificationFeed(
  signal?: AbortSignal,
): Promise<NotificationFeedResponse> {
  const response = await fetch(
    `${NOTIFICATION_FEED_ENDPOINT}?limit=${NOTIFICATION_FEED_PAGE_SIZE}`,
    { credentials: 'same-origin', cache: 'no-store', ...(signal ? { signal } : {}) },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as NotificationFeedResponse;
}

export async function markNotificationFeedRead(
  selection: { ids: readonly string[] } | { all: true },
): Promise<void> {
  const csrf = await getCsrfToken();
  const response = await fetch(NOTIFICATION_FEED_ENDPOINT, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify(selection),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

/*
 * Web Push service worker.
 *
 * Served from the origin root so its scope covers the whole app. It is
 * deliberately the only worker registered: it caches nothing and intercepts no
 * fetches, because an offline cache here would shadow the App Router's own
 * streaming responses.
 */

const RUNS_PATH = '/tasks';
const RUN_QUERY_PARAM = 'run';
const CHAT_PATH = '/chat';
const HIGHLIGHT_QUERY_PARAM = 'highlightMessage';
const ICON_URL = '/logo-192.png';
const BADGE_URL = '/logo-192.png';
const FALLBACK_TITLE = 'AGI';
const SUBSCRIPTION_ENDPOINT = '/api/web-push';
const CSRF_ENDPOINT = '/api/csrf';
const CSRF_HEADER = 'x-csrf-token';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function readPayload(event) {
  if (!event.data) return null;
  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}

/*
 * `data.route` in the payload is the Expo route for the mobile client, so it is
 * ignored here and the web target is rebuilt from the ids the notice carries.
 *
 * A conversation id wins over a run id: a notice about work that landed in a
 * chat (a video that finished after the tab was closed) has to open that chat,
 * and `highlightMessage` is the parameter the chat page already reads to scroll
 * to and mark the message. `/tasks` does not read its query parameter yet;
 * until it does, the click still lands on the page that lists the run.
 */
function targetUrl(payload) {
  const data = (payload && payload.data) || {};
  const conversationId = data.conversationId;
  if (typeof conversationId === 'string' && conversationId.length > 0) {
    const chatUrl = `${CHAT_PATH}/${encodeURIComponent(conversationId)}`;
    const messageId = data.messageId;
    if (typeof messageId !== 'string' || messageId.length === 0) return chatUrl;
    return `${chatUrl}?${HIGHLIGHT_QUERY_PARAM}=${encodeURIComponent(messageId)}`;
  }
  const runId = data.runId;
  if (typeof runId !== 'string' || runId.length === 0) return RUNS_PATH;
  return `${RUNS_PATH}?${RUN_QUERY_PARAM}=${encodeURIComponent(runId)}`;
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event) || {};
  const url = targetUrl(payload);

  event.waitUntil(
    self.registration.showNotification(payload.title || FALLBACK_TITLE, {
      body: payload.body || '',
      icon: ICON_URL,
      badge: BADGE_URL,
      // One notification per run: a run that moves from "needs approval" to
      // "finished" should replace its earlier card, not stack a second one.
      tag: url,
      renotify: true,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || RUNS_PATH;
  const target = new URL(url, self.location.origin);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).pathname !== target.pathname) continue;
        return client.focus().then((focused) => {
          if (focused && 'navigate' in focused) return focused.navigate(target.href);
          return focused;
        });
      }
      return self.clients.openWindow(target.href);
    }),
  );
});

/*
 * A push service may rotate an endpoint without the page ever being open. The
 * server prunes the dead one when it next tries to deliver, so unless the new
 * one is registered here the browser goes quiet permanently.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const previous =
        event.oldSubscription || (await self.registration.pushManager.getSubscription());
      const applicationServerKey =
        (event.newSubscription && event.newSubscription.options.applicationServerKey) ||
        (previous && previous.options.applicationServerKey);
      if (!applicationServerKey) return;

      const subscription =
        event.newSubscription ||
        (await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        }));

      const csrfResponse = await fetch(CSRF_ENDPOINT);
      if (!csrfResponse.ok) return;
      const { token } = await csrfResponse.json();

      await fetch(SUBSCRIPTION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: token },
        body: JSON.stringify(subscription.toJSON()),
      });
    })(),
  );
});

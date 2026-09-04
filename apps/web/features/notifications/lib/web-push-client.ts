import { addCsrfHeaders } from '@/lib/client/csrf';

const SERVICE_WORKER_PATH = '/sw.js';
const SUBSCRIPTION_ENDPOINT = '/api/web-push';
const BASE64_GROUP_CHARS = 4;
const CLAIMED_BY_ANOTHER_ACCOUNT_STATUS = 403;

export type WebPushEnableResult = 'enabled' | 'denied' | 'unavailable';

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function readNotificationPermission(): NotificationPermission | null {
  return isWebPushSupported() ? Notification.permission : null;
}

export async function registerNotificationWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) return null;
  try {
    await navigator.serviceWorker.register(SERVICE_WORKER_PATH);
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** Null whenever the server has no VAPID key pair, which is how a deployment without one stays silent instead of offering something it cannot deliver. */
export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const response = await fetch(SUBSCRIPTION_ENDPOINT);
    if (!response.ok) return null;
    const { publicKey } = (await response.json()) as { publicKey?: unknown };
    return typeof publicKey === 'string' && publicKey.length > 0 ? publicKey : null;
  } catch {
    return null;
  }
}

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = (BASE64_GROUP_CHARS - (value.length % BASE64_GROUP_CHARS)) % BASE64_GROUP_CHARS;
  const binary = atob(
    value
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(value.length + padding, '='),
  );
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

type StoreOutcome = 'stored' | 'claimed' | 'failed';

async function storeSubscription(subscription: PushSubscription): Promise<StoreOutcome> {
  try {
    const response = await fetch(SUBSCRIPTION_ENDPOINT, {
      method: 'POST',
      headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(subscription.toJSON()),
    });
    if (response.ok) return 'stored';
    return response.status === CLAIMED_BY_ANOTHER_ACCOUNT_STATUS ? 'claimed' : 'failed';
  } catch {
    return 'failed';
  }
}

function subscribe(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<PushSubscription> {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidKey(publicKey),
  });
}

/**
 * A push service hands out one endpoint per browser profile, so after a second
 * account signs in here the browser still holds the first account's
 * registration. The server refuses to move a registration between accounts, so
 * the held one is dropped and a fresh endpoint is taken out for this account.
 * without that, the second person to use a shared browser could never turn
 * notifications on at all.
 */
async function registerSubscription(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<boolean> {
  const held = await registration.pushManager.getSubscription();
  const outcome = await storeSubscription(held ?? (await subscribe(registration, publicKey)));
  if (outcome === 'stored') return true;
  if (outcome === 'failed' || !held) return false;

  await held.unsubscribe();
  return (await storeSubscription(await subscribe(registration, publicKey))) === 'stored';
}

/**
 * Re-registers a subscription the browser already holds.
 *
 * Delivery prunes an endpoint the push service reports as gone, and a browser
 * that still holds that subscription would otherwise never be heard from again.
 */
export async function syncExistingSubscription(): Promise<void> {
  const registration = await registerNotificationWorker();
  if (!registration) return;
  if (!(await registration.pushManager.getSubscription())) return;

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) return;

  try {
    await registerSubscription(registration, publicKey);
  } catch {
    // A browser that refuses to re-subscribe keeps whatever it already had.
  }
}

/** Must be called from a user gesture: it is what raises the browser permission prompt. */
export async function enableWebPush(): Promise<WebPushEnableResult> {
  if (!isWebPushSupported()) return 'unavailable';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const [registration, publicKey] = await Promise.all([
    registerNotificationWorker(),
    fetchVapidPublicKey(),
  ]);
  if (!registration || !publicKey) return 'unavailable';

  try {
    return (await registerSubscription(registration, publicKey)) ? 'enabled' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function disableWebPush(): Promise<boolean> {
  if (!isWebPushSupported()) return false;
  const registration = await registerNotificationWorker();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return true;

  try {
    const response = await fetch(SUBSCRIPTION_ENDPOINT, {
      method: 'DELETE',
      headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
    return response.ok;
  } catch {
    return false;
  }
}

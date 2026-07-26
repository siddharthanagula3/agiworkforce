import { API_URL, TIMEOUTS } from '@/lib/constants';
import { getDeviceId } from '@/lib/deviceId';
import { secureFetch } from '@/services/secureFetch';

const PUSH_TOKEN_PATH = '/api/mobile/push-token';

/**
 * Revoke this device's push token during explicit sign-out.
 *
 * This is the sole intentional exception to Local mode's managed-cloud egress
 * block. The caller captures the current Clerk JWT before switching the UI and
 * persisted app mode to Local, then passes it here. The exception cannot be
 * repurposed for chat/files/telemetry because neither URL nor method is
 * caller-controlled: it always issues one DELETE to the configured API origin's
 * exact push-token path through secureFetch (the TLS-pinning chokepoint).
 */
export async function unregisterPushTokenForSignOut(capturedClerkToken: string): Promise<void> {
  const token = capturedClerkToken.trim();
  if (!token) return;

  const configuredApi = new URL(API_URL);
  if (
    configuredApi.protocol !== 'https:' ||
    configuredApi.username !== '' ||
    configuredApi.password !== ''
  ) {
    throw new Error('Push-token sign-out cleanup requires a credential-free HTTPS API origin');
  }

  const endpoint = new URL(PUSH_TOKEN_PATH, configuredApi);
  if (endpoint.origin !== configuredApi.origin || endpoint.pathname !== PUSH_TOKEN_PATH) {
    throw new Error('Push-token sign-out cleanup endpoint failed its exact-path guard');
  }

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error('Push-token sign-out cleanup timed out'));
    }, TIMEOUTS.SIGN_OUT_CLEANUP);
  });

  try {
    await Promise.race([
      (async () => {
        endpoint.searchParams.set('deviceId', await getDeviceId());
        if (controller.signal.aborted) return;

        const response = await secureFetch(endpoint.toString(), {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Requested-With': 'XMLHttpRequest',
          },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Push-token sign-out cleanup failed with HTTP ${response.status}`);
        }
      })(),
      timeout,
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

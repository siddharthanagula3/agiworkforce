import { API_URL, TIMEOUTS } from '@/lib/constants';
import { getDeviceId } from '@/lib/deviceId';
import { secureFetch } from '@/services/secureFetch';

const PUSH_TOKEN_PATH = '/api/mobile/push-token';

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

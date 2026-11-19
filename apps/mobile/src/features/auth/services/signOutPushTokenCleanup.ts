import { API_URL, TIMEOUTS } from '@/lib/constants';
import { getDeviceId } from '@/lib/deviceId';
import { secureFetch } from '@/services/secureFetch';

const PUSH_TOKEN_PATH = '/api/mobile/push-token';
const RELEASE_PARAM = 'release';
const RELEASE_DEVICE = 'device';
const CREDENTIAL_REJECTED_STATUS = 401;

export class PushTokenCleanupCredentialRejectedError extends Error {
  constructor(readonly status: number) {
    super(`Push-token sign-out cleanup credential was rejected with HTTP ${status}`);
    this.name = 'PushTokenCleanupCredentialRejectedError';
  }
}

export async function unregisterPushTokenForSignOut(capturedClerkToken: string): Promise<void> {
  await deletePushTokenRegistration(capturedClerkToken, { releaseDevice: false });
}

export async function releasePushDeviceForAccountHandover(
  capturedClerkToken: string,
): Promise<void> {
  await deletePushTokenRegistration(capturedClerkToken, { releaseDevice: true });
}

async function deletePushTokenRegistration(
  capturedClerkToken: string,
  { releaseDevice }: { releaseDevice: boolean },
): Promise<void> {
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
        if (releaseDevice) endpoint.searchParams.set(RELEASE_PARAM, RELEASE_DEVICE);
        if (controller.signal.aborted) return;

        const response = await secureFetch(endpoint.toString(), {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Requested-With': 'XMLHttpRequest',
          },
          signal: controller.signal,
        });
        if (response.status === CREDENTIAL_REJECTED_STATUS) {
          throw new PushTokenCleanupCredentialRejectedError(response.status);
        }
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

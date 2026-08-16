import {
  pollDeviceAuthorization,
  requestDeviceAuthorization,
  type DeviceAuthorizationPost,
} from '@agiworkforce/client-runtime';

export interface DesktopDeviceAuthorizationOptions {
  origin: string;
  post: DeviceAuthorizationPost;
  openAuthorization: (url: string) => Promise<void>;
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
}

export interface DesktopDeviceCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

function abortError(): Error {
  return new Error('AGI Cloud sign-in was cancelled.');
}

function waitForPoll(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });
}

export async function authorizeDesktopDevice({
  origin,
  post,
  openAuthorization,
  wait = waitForPoll,
  signal,
}: DesktopDeviceAuthorizationOptions): Promise<DesktopDeviceCredential> {
  if (signal?.aborted) throw abortError();

  const authorization = await requestDeviceAuthorization(origin, post, 'desktop');
  await openAuthorization(authorization.verificationUrl);

  const maxPolls = Math.max(1, Math.ceil(authorization.expiresInMs / authorization.pollIntervalMs));
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (signal?.aborted) throw abortError();
    await wait(authorization.pollIntervalMs, signal);
    if (signal?.aborted) throw abortError();

    const result = await pollDeviceAuthorization(origin, authorization.deviceCode, post);
    if (result.kind === 'approved') {
      return {
        accessToken: result.token,
        ...(result.refreshToken ? { refreshToken: result.refreshToken } : {}),
        expiresAt: result.expiresAt,
      };
    }
    if (result.kind === 'denied') {
      throw new Error('AGI Cloud sign-in was denied.');
    }
    if (result.kind === 'expired') {
      throw new Error('AGI Cloud sign-in expired. Start again.');
    }
    if (result.kind === 'rejected') {
      throw new Error(result.message);
    }
  }

  throw new Error('AGI Cloud sign-in timed out. Start again.');
}

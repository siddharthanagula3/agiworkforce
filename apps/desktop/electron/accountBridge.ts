import { CLOUD_APP_ORIGIN, isAllowedApiBaseUrl } from './config';
import { executeClerkNativeRequest } from './clerkProxy';
import { clearSecrets, getSecret, isSecretKey, setSecret, type SecretKey } from './secretStore';

interface DeviceAuthorizationHttpResponse {
  status: number;
  body: string;
}

let apiBaseUrlOverride: string | null = null;

function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause instanceof Error) {
    const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : null;
    return code
      ? `${error.message} (${code}: ${cause.message})`
      : `${error.message} (${cause.message})`;
  }
  return error.message;
}

async function resolveApiBase(): Promise<string> {
  if (apiBaseUrlOverride) return apiBaseUrlOverride;
  const stored = await getSecret('api_base_url');
  if (stored && isAllowedApiBaseUrl(stored)) return stored.replace(/\/+$/, '');
  return CLOUD_APP_ORIGIN;
}

async function executeDeviceAuthorizationRequest(
  path: string,
  body: unknown,
  bearer?: string,
): Promise<DeviceAuthorizationHttpResponse> {
  const base = await resolveApiBase();
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-AGI-Surface': 'desktop',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(
      `Could not reach the AGI account service at ${base}: ${describeFetchError(error)}`,
    );
  }
  return { status: response.status, body: await response.text() };
}

function requireString(args: Record<string, unknown> | undefined, key: string): string {
  const value = args?.[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required argument: ${key}`);
  }
  return value.trim();
}

function validateTokenFormat(token: string, label: string): void {
  if (token.length === 0 || token.length > 8192 || /\s/.test(token)) {
    throw new Error(`Invalid ${label}.`);
  }
}

async function storeSecretCommand(key: SecretKey, value: string): Promise<null> {
  validateTokenFormat(value, key.replace(/_/g, ' '));
  await setSecret(key, value);
  return null;
}

export async function handleBridgeCommand(
  command: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  switch (command) {
    case 'account_clerk_native_request': {
      return executeClerkNativeRequest({
        publishableKey: requireString(args, 'publishableKey'),
        method: requireString(args, 'method'),
        path: requireString(args, 'path'),
        body: typeof args?.['body'] === 'string' ? (args['body'] as string) : null,
        clientToken:
          typeof args?.['clientToken'] === 'string' ? (args['clientToken'] as string) : null,
        search: typeof args?.['search'] === 'string' ? (args['search'] as string) : null,
      });
    }

    case 'account_start_device_authorization':
      return executeDeviceAuthorizationRequest('/api/auth/device/code', { surface: 'desktop' });

    case 'account_poll_device_authorization': {
      const deviceCode = requireString(args, 'deviceCode');
      if (deviceCode.length > 128) {
        throw new Error('Invalid AGI Cloud device authorization code.');
      }
      return executeDeviceAuthorizationRequest('/api/auth/device/token', {
        device_code: deviceCode,
      });
    }

    case 'account_approve_device_authorization': {
      const userCode = requireString(args, 'userCode').toUpperCase();
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(userCode)) {
        throw new Error('Invalid AGI Cloud device user code.');
      }
      const sessionToken = requireString(args, 'sessionToken');
      validateTokenFormat(sessionToken, 'AGI account session token');
      return executeDeviceAuthorizationRequest(
        '/api/auth/device/approve',
        { user_code: userCode, action: 'approve' },
        sessionToken,
      );
    }

    case 'account_store_api_base_url': {
      const apiBaseUrl = requireString(args, 'apiBaseUrl').replace(/\/+$/, '');
      if (!isAllowedApiBaseUrl(apiBaseUrl)) {
        throw new Error('API base URL host is not in the allowlist.');
      }
      apiBaseUrlOverride = apiBaseUrl;
      await setSecret('api_base_url', apiBaseUrl);
      return null;
    }

    case 'account_store_access_token':
      return storeSecretCommand('access_token', requireString(args, 'accessToken'));

    case 'account_store_refresh_token':
      return storeSecretCommand('refresh_token', requireString(args, 'refreshToken'));

    case 'account_restore_access_token':
      return getSecret('access_token');

    case 'account_restore_refresh_token':
      return getSecret('refresh_token');

    case 'account_clear_tokens':
      await clearSecrets(['access_token', 'refresh_token']);
      return null;

    default:
      throw new Error(`Unknown bridge command: ${command}`);
  }
}

export { isSecretKey };

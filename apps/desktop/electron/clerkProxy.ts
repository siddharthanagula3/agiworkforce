
const CLERK_API_VERSION = '2026-05-12';
const CLERK_JS_VERSION = '6.25.3';

export interface ClerkNativeRequest {
  publishableKey: string;
  method: string;
  path: string;
  body?: string | null;
  clientToken?: string | null;
  search?: string | null;
}

export interface ClerkNativeResponse {
  status: number;
  body: string;
  clientToken: string | null;
}

export function frontendApiFromPublishableKey(publishableKey: string): string {
  const key = publishableKey.trim();
  const encoded = key.startsWith('pk_live_')
    ? key.slice('pk_live_'.length)
    : key.startsWith('pk_test_')
      ? key.slice('pk_test_'.length)
      : null;
  if (encoded === null) {
    throw new Error('The Clerk publishable key must start with pk_live_ or pk_test_.');
  }
  if (encoded === '') {
    throw new Error('The Clerk publishable key is empty after its prefix.');
  }

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    throw new Error('The Clerk publishable key is not valid base64.');
  }
  if (!decoded.endsWith('$')) {
    throw new Error('The Clerk publishable key has an unexpected payload.');
  }
  const host = decoded.slice(0, -1);
  if (host === '' || host.includes('$') || !host.includes('.')) {
    throw new Error('The Clerk publishable key does not name a frontend API host.');
  }
  if (!/^[A-Za-z0-9.-]+$/.test(host)) {
    throw new Error('The Clerk publishable key names an invalid frontend API host.');
  }
  return host;
}

export function validateClerkPath(path: string): void {
  const refuse = () => {
    throw new Error('Refusing an unsupported Clerk request path.');
  };
  if (!path.startsWith('/') || path.includes('..') || path.includes('//')) refuse();
  if (!/^[A-Za-z0-9/_-]+$/.test(path)) refuse();

  const segments = path.replace(/^\//, '').split('/');
  const [a, b, c, d, e] = segments;
  const allowed =
    (segments.length === 3 && a === 'v1' && b === 'client' && c === 'sign_ins') ||
    (segments.length === 4 && a === 'v1' && b === 'client' && c === 'sign_ins' && d !== '') ||
    (segments.length === 5 &&
      a === 'v1' &&
      b === 'client' &&
      c === 'sign_ins' &&
      d !== '' &&
      [
        'prepare_first_factor',
        'attempt_first_factor',
        'prepare_second_factor',
        'attempt_second_factor',
      ].includes(e ?? '')) ||
    (segments.length === 5 &&
      a === 'v1' &&
      b === 'client' &&
      c === 'sessions' &&
      d !== '' &&
      e === 'tokens');
  if (!allowed) refuse();
}

function clerkQueryParams(extra: string | null | undefined): URLSearchParams {
  const params = new URLSearchParams();
  params.set('__clerk_api_version', CLERK_API_VERSION);
  params.set('_clerk_js_version', CLERK_JS_VERSION);
  params.set('_is_native', '1');

  if (extra) {
    for (const pair of extra.replace(/^\?/, '').split('&')) {
      if (pair === '') continue;
      const eq = pair.indexOf('=');
      if (eq === -1) throw new Error('Refusing a malformed Clerk query parameter.');
      const name = pair.slice(0, eq);
      if (name !== 'rotating_token_nonce') {
        throw new Error('Refusing an unsupported Clerk query parameter.');
      }
      let decoded: string;
      try {
        decoded = decodeURIComponent(pair.slice(eq + 1));
      } catch {
        throw new Error('Refusing a malformed Clerk query parameter.');
      }
      if (decoded.length > 512) {
        throw new Error('Refusing an oversized Clerk query parameter.');
      }
      params.set(name, decoded);
    }
  }
  return params;
}

export async function executeClerkNativeRequest(
  request: ClerkNativeRequest,
): Promise<ClerkNativeResponse> {
  const frontendApi = frontendApiFromPublishableKey(request.publishableKey);
  validateClerkPath(request.path);

  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    throw new Error(`Refusing an unsupported Clerk request method: ${request.method}`);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
    'x-native-app': '1',
  };
  const clientToken = request.clientToken?.trim();
  if (clientToken) {
    if (clientToken.length > 8192) {
      throw new Error('The Clerk client credential is too large.');
    }
    headers['authorization'] = clientToken;
  }

  const url = new URL(`https://${frontendApi}${request.path}`);
  url.search = clerkQueryParams(request.search).toString();

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? (request.body ?? undefined) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(`Could not reach the AGI account service: ${String(error)}`);
  }

  const rotated = response.headers.get('authorization')?.trim() ?? '';
  return {
    status: response.status,
    body: await response.text(),
    clientToken: rotated === '' ? null : rotated,
  };
}

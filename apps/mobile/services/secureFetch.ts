import { PINNING_ENFORCED, pinsAreProvisionedForUrl } from '@/lib/pinning';

export class PinningError extends Error {
  constructor(url: string) {
    super(
      `secureFetch refused: pinning is enforced but no provisioned pins are configured for "${url}". ` +
        `Add provisioned SPKI hashes to lib/pinning.ts → PINS_BY_HOST.`,
    );
    this.name = 'PinningError';
  }
}

export interface SecureFetchOptions {
  stream?: boolean;
}

function normalizeRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export async function secureFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: SecureFetchOptions,
): Promise<Response> {
  const url = normalizeRequestUrl(input);
  if (PINNING_ENFORCED && !pinsAreProvisionedForUrl(url)) {
    throw new PinningError(url);
  }
  if (opts?.stream && (typeof input === 'string' || input instanceof URL)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fetch: expoFetch } = require('expo/fetch') as typeof import('expo/fetch');
    return expoFetch(url, init as unknown as Parameters<typeof expoFetch>[1]);
  }
  return fetch(input, init);
}

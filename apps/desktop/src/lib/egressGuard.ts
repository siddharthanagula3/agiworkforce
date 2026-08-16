
import { isPrivateTrustBoundary } from '../stores/privacyBoundary';
import { OUR_CLOUD_HOSTS, isOurCloudHost } from '@agiworkforce/trust-boundaries';

export { OUR_CLOUD_HOSTS, isOurCloudHost };

function isLocalMode(): boolean {
  return isPrivateTrustBoundary();
}

function extractHost(input: RequestInfo | URL): string | null {
  try {
    if (typeof input === 'string') {
      return new URL(input).hostname;
    }
    if (input instanceof URL) {
      return input.hostname;
    }
    if (typeof Request !== 'undefined' && input instanceof Request) {
      return new URL(input.url).hostname;
    }
    const maybeUrl = (input as { url?: unknown }).url;
    if (typeof maybeUrl === 'string') {
      return new URL(maybeUrl).hostname;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Guarded replacement for `fetch`. In the Local workspace (including BYOK),
 * throws BEFORE any
 * network call if the target is one of OUR cloud hosts. Otherwise delegates to
 * the global `fetch`. BYOK provider hosts are not on the denylist, so they pass.
 *
 * @throws Error when an our-cloud egress is attempted in Local mode.
 */
export async function guardedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (isLocalMode()) {
    const host = extractHost(input);
    if (isOurCloudHost(host)) {
      throw new Error(`[egress-guard] blocked our-cloud egress in Local mode: ${host}`);
    }
  }
  return fetch(input, init);
}

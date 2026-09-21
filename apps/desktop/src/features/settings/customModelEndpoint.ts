import { isOurCloudHost } from '../../lib/egressGuard';

export interface EndpointValidation {
  valid: boolean;
  normalized?: string;
  error?: string;
}

const PRIVATE_IPV4_RANGES: readonly RegExp[] = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.0\.0\./,
  /^192\.168\./,
  /^198\.(1[89])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^(22[4-9]|2[3-5]\d)\./,
  /^255\.255\.255\.255$/,
];

const PRIVATE_HOST_SUFFIXES: readonly string[] = [
  '.localhost',
  '.local',
  '.internal',
  '.home.arpa',
];

const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

function isPrivateIpv6(host: string): boolean {
  if (host === '::1' || host === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
  return mapped ? isPrivateIpv4(mapped[1] ?? '') : false;
}

function isPrivateIpv4(host: string): boolean {
  return PRIVATE_IPV4_RANGES.some((range) => range.test(host));
}

// The conversation and an API key go to this URL, so it must look like a hosted
// provider: https, a public name, no credentials; local models use Local Models.
export function validateCustomModelEndpoint(raw: string): EndpointValidation {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, error: 'Base URL is required.' };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Enter a full URL, for example https://api.example.com/v1' };
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: 'The endpoint must use https, so the API key is not sent in the clear.',
    };
  }
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: 'Remove the credentials from the URL and put the key in the API Key field.',
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host)
    return { valid: false, error: 'Enter a full URL, for example https://api.example.com/v1' };

  if (host === 'localhost' || PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return {
      valid: false,
      error: 'This address is on your own machine or network. Use Local Models for those.',
    };
  }
  if (IPV4_PATTERN.test(host) && isPrivateIpv4(host)) {
    return {
      valid: false,
      error: 'This address is inside a private network and is not a provider endpoint.',
    };
  }
  if (host.includes(':') && isPrivateIpv6(host)) {
    return {
      valid: false,
      error: 'This address is inside a private network and is not a provider endpoint.',
    };
  }
  if (isOurCloudHost(host)) {
    return {
      valid: false,
      error:
        'A custom model is a provider of your own. This address belongs to AGI Workforce, which a workspace that keeps your work on this device never calls.',
    };
  }

  return { valid: true, normalized: parsed.toString().replace(/\/$/, '') };
}

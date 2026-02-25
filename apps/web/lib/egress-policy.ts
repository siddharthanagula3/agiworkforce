/**
 * Egress policy: validates outbound URLs against a hardened allowlist.
 * Call validateEgressUrl() before any fetch() to an external service.
 */

const ALLOWED_HOSTNAMES = [
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.stripe.com',
  'api.upstash.io',
  // Supabase: wildcard for project-specific subdomains
] as const;

const SUPABASE_PATTERN = /^[a-z0-9-]+\.supabase\.(co|io)$/;

export class EgressPolicyError extends Error {
  constructor(url: string) {
    super(`Egress blocked: ${url} is not in the approved allowlist`);
    this.name = 'EgressPolicyError';
  }
}

export function validateEgressUrl(urlString: string): void {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new EgressPolicyError(urlString);
  }

  if (url.protocol !== 'https:') {
    throw new EgressPolicyError(urlString);
  }

  const hostname = url.hostname;
  if (ALLOWED_HOSTNAMES.includes(hostname as (typeof ALLOWED_HOSTNAMES)[number])) return;
  if (SUPABASE_PATTERN.test(hostname)) return;

  throw new EgressPolicyError(urlString);
}

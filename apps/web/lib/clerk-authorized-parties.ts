import 'server-only';

function parseConfiguredParties(): string[] {
  return (process.env['CLERK_AUTHORIZED_PARTIES'] ?? '')
    .split(',')
    .map((party) => party.trim())
    .filter(Boolean);
}

function ownOrigin(): string | null {
  const appUrl = process.env['NEXT_PUBLIC_APP_URL']?.trim();
  if (!appUrl) return null;
  try {
    return new URL(appUrl).origin;
  } catch {
    return null;
  }
}

export function getClerkAuthorizedParties(): string[] {
  const configured = parseConfiguredParties();
  if (configured.length > 0) return configured;

  const origin = ownOrigin();
  if (origin) return [origin];

  throw new Error(
    'Clerk bearer verification requires an authorized-party allowlist: set CLERK_AUTHORIZED_PARTIES, or a valid absolute NEXT_PUBLIC_APP_URL to fall back to this deployment origin.',
  );
}

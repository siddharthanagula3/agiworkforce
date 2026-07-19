import type { NextRequest } from 'next/server';
import { canUseBillingPlanCapability, type BillingPlanCapability } from '@agiworkforce/types';

export type CloudChatSurface =
  | 'web'
  | 'mobile'
  | 'desktop'
  | 'chrome'
  | 'vscode'
  | 'cli'
  | 'api'
  | 'unknown';

const KNOWN_SURFACES = new Set<CloudChatSurface>([
  'web',
  'mobile',
  'desktop',
  'chrome',
  'vscode',
  'cli',
  'api',
]);

/**
 * SECURITY — trust model. `x-agi-surface`/`x-client` are caller-declared and are
 * only ADVISORY telemetry here. The exploitable developer-surface path (CLI/IDE)
 * authenticates via first-party device-authorization tokens, which this web
 * route rejects (verifyBearerToken accepts Clerk tokens only) and which the
 * api-gateway now gates on the TRUSTED, issuer-derived surface class
 * (`developer` ⇒ Pro-only `developer_surfaces`). Chrome is corroborated by the
 * unspoofable `chrome-extension://` Origin. Clerk app clients (desktop/mobile)
 * cannot cross the developer boundary from a header. Residual risk (a Clerk
 * session token has no issuance-time surface claim to separate desktop from a
 * hypothetical developer client on THIS route) is tracked in known-flaws.md; the
 * durable fix is a signed surface claim in the Clerk JWT template.
 */
export function resolveCloudChatSurface(request: NextRequest): CloudChatSurface {
  if (request.headers.get('x-client')?.trim().toLowerCase() === 'vscode-extension') {
    return 'vscode';
  }
  if (request.headers.get('origin')?.trim().toLowerCase().startsWith('chrome-extension://')) {
    return 'chrome';
  }
  const explicit = request.headers.get('x-agi-surface')?.trim().toLowerCase();
  if (explicit && KNOWN_SURFACES.has(explicit as CloudChatSurface)) {
    return explicit as CloudChatSurface;
  }
  return 'unknown';
}

/**
 * Resolve the plan capability required by a Managed Cloud caller. Unknown
 * callers intentionally have no capability so even Enterprise fails closed.
 */
export function getCloudChatSurfaceCapability(
  surface: CloudChatSurface,
): BillingPlanCapability | null {
  switch (surface) {
    case 'web':
    case 'mobile':
    case 'desktop':
      return 'managed_chat';
    case 'chrome':
    case 'vscode':
    case 'cli':
      return 'developer_surfaces';
    case 'api':
      return 'managed_api';
    case 'unknown':
      return null;
  }
}

/** Fail-closed Managed Cloud admission across every client surface and plan. */
export function canUseManagedCloudChatSurface(
  planTier: string | null | undefined,
  surface: CloudChatSurface,
): boolean {
  const capability = getCloudChatSurfaceCapability(surface);
  return capability !== null && canUseBillingPlanCapability(planTier, capability);
}

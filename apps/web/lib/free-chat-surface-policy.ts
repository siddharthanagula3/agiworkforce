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
 * Device-token developer surfaces. The Chrome consumer extension authenticates
 * with the same Clerk account as Web/Mobile/Desktop, so it belongs to managed
 * chat rather than this Pro-only developer class.
 */
const DEVELOPER_SURFACES = new Set<CloudChatSurface>(['vscode', 'cli']);

/**
 * A surface class the SERVER proved from the credential itself, as opposed to
 * one the caller asserted in a header. Today the only provable class is
 * `developer`: `verifyDeveloperTokenSignature` rejects any token whose signed
 * `surface` claim is not exactly `'developer'`, so a token that verifies through
 * that path IS a developer-surface token by construction.
 */
export type AuthenticatedSurfaceClass = 'developer';

function readSurfaceHint(request: NextRequest): CloudChatSurface | null {
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
  return null;
}

/**
 * SECURITY — trust model. `x-agi-surface`/`x-client` are caller-declared and are
 * only ADVISORY. When the credential itself proves a surface class, that class
 * is AUTHORITATIVE and a header may only refine which surface inside the class
 * is reported — it can never move the caller out of the class.
 *
 * WEB-AUTH-SURFACE-CLAIM-DISCARDED-01. This function previously trusted the
 * header alone, justified by a comment asserting that "this web route rejects
 * device-authorization tokens (verifyBearerToken accepts Clerk tokens only)".
 * That was true when it was written (`7a78ecbd0`, 2026-07-19) and stopped being
 * true four days later: `27ac1a55c` ("fix(auth): accept revocable developer
 * device tokens", 2026-07-23) taught `verifyBearerToken` to accept developer
 * tokens without updating the rationale that depended on it rejecting them.
 * A Free/Basic holder of a valid developer token could then send
 * `x-agi-surface: desktop` and be admitted under `managed_chat` instead of the
 * Pro-only `developer_surfaces` capability.
 *
 * Chrome is additionally corroborated by the unspoofable `chrome-extension://`
 * Origin. The residual gap is unchanged and still tracked: a Clerk session token
 * carries no issuance-time surface claim, so desktop and a hypothetical Clerk
 * developer client are indistinguishable on this route. The durable fix remains
 * a signed surface claim in the Clerk JWT template.
 */
export function resolveCloudChatSurface(
  request: NextRequest,
  authenticatedSurfaceClass?: AuthenticatedSurfaceClass,
): CloudChatSurface {
  const hint = readSurfaceHint(request);

  if (authenticatedSurfaceClass === 'developer') {
    // Trusted class. Keep the header's granularity only when it names a surface
    // already inside the class; otherwise report the class's default member so
    // the capability lookup below still resolves to `developer_surfaces`.
    return hint && DEVELOPER_SURFACES.has(hint) ? hint : 'cli';
  }

  return hint ?? 'unknown';
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
    case 'chrome':
      return 'managed_chat';
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

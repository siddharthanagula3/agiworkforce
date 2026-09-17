import type { NextRequest } from 'next/server';
import {
  canUseBillingPlanCapability,
  SURFACE_TOKEN_CLAIM,
  TEMPLATE_BOUND_SURFACES,
  type BillingPlanCapability,
  type TemplateBoundSurface,
} from '@agiworkforce/types';

export type CloudChatSurface =
  'web' | 'mobile' | 'desktop' | 'chrome' | 'vscode' | 'cli' | 'api' | 'unknown';

const KNOWN_SURFACES = new Set<CloudChatSurface>([
  'web',
  'mobile',
  'desktop',
  'chrome',
  'vscode',
  'cli',
  'api',
]);

const DEVELOPER_SURFACES = new Set<CloudChatSurface>(['vscode', 'cli']);

const WEB_TOKEN_CARRIERS = new Set<CloudChatSurface>(['desktop', 'chrome']);

export type AuthenticatedSurfaceClass = 'developer';

/**
 * The surface a verified Clerk token is bound to, decided from claims Clerk
 * signed rather than headers the caller typed. `azp` is the origin that minted
 * the token, which names the web app or the browser extension; the mobile app
 * mints from a JWT template that carries the surface claim. A token with
 * neither, which is what a script minting tokens with no origin holds, binds
 * to nothing, and the plan gate then fails closed (D-2026-09-15-09).
 */
export type BoundSurface = 'web' | 'chrome' | TemplateBoundSurface;

export function bindSurfaceFromClaims(
  claims: Readonly<Record<string, unknown>>,
): BoundSurface | null {
  const claimed = claims[SURFACE_TOKEN_CLAIM];
  if (
    typeof claimed === 'string' &&
    (TEMPLATE_BOUND_SURFACES as readonly string[]).includes(claimed)
  ) {
    return claimed as TemplateBoundSurface;
  }
  const azp = typeof claims['azp'] === 'string' ? claims['azp'].trim().toLowerCase() : '';
  if (!azp) return null;
  return azp.startsWith('chrome-extension://') ? 'chrome' : 'web';
}

export function readSurfaceHint(request: NextRequest): CloudChatSurface | null {
  if (request.headers.get('x-client')?.trim().toLowerCase() === 'vscode-extension') {
    return 'vscode';
  }
  const explicit = request.headers.get('x-agi-surface')?.trim().toLowerCase();
  if (explicit && KNOWN_SURFACES.has(explicit as CloudChatSurface)) {
    return explicit as CloudChatSurface;
  }
  return null;
}

/**
 * The header only ever refines a surface the credential already proved: a
 * developer token picks between the CLI and the IDE, and a token the web app
 * minted picks between the browser, the desktop shell that carries the web app
 * and the extension that signs in through it, which share one capability. It
 * never widens what the credential allows.
 */
export function resolveCloudChatSurface(
  request: NextRequest,
  authenticatedSurfaceClass?: AuthenticatedSurfaceClass,
  boundSurface?: BoundSurface | null,
): CloudChatSurface {
  const hint = readSurfaceHint(request);

  if (authenticatedSurfaceClass === 'developer') {
    return hint && DEVELOPER_SURFACES.has(hint) ? hint : 'cli';
  }
  if (boundSurface === 'web') {
    return hint && WEB_TOKEN_CARRIERS.has(hint) ? hint : 'web';
  }
  return boundSurface ?? 'unknown';
}

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

export function canUseManagedCloudChatSurface(
  planTier: string | null | undefined,
  surface: CloudChatSurface,
): boolean {
  const capability = getCloudChatSurfaceCapability(surface);
  return capability !== null && canUseBillingPlanCapability(planTier, capability);
}

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

const DEVELOPER_SURFACES = new Set<CloudChatSurface>(['vscode', 'cli']);

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

export function resolveCloudChatSurface(
  request: NextRequest,
  authenticatedSurfaceClass?: AuthenticatedSurfaceClass,
): CloudChatSurface {
  const hint = readSurfaceHint(request);

  if (authenticatedSurfaceClass === 'developer') {
    return hint && DEVELOPER_SURFACES.has(hint) ? hint : 'cli';
  }

  return hint ?? 'unknown';
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

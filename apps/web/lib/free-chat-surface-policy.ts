import type { NextRequest } from 'next/server';

export type CloudChatSurface =
  | 'web'
  | 'mobile'
  | 'desktop'
  | 'chrome'
  | 'vscode'
  | 'api'
  | 'unknown';

const KNOWN_SURFACES = new Set<CloudChatSurface>([
  'web',
  'mobile',
  'desktop',
  'chrome',
  'vscode',
  'api',
]);

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

export function canUseFreeCloudChat(surface: CloudChatSurface): boolean {
  return surface === 'web' || surface === 'mobile' || surface === 'desktop';
}

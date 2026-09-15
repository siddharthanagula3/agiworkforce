import type { NextRequest } from 'next/server';
import {
  resolveCloudChatSurface,
  type AuthenticatedSurfaceClass,
  type BoundSurface,
  type CloudChatSurface,
} from '@/lib/free-chat-surface-policy';

export type SurfaceCredential = {
  token: string;
  surfaceClass?: AuthenticatedSurfaceClass;
  boundSurface?: BoundSurface;
};

/**
 * The one place a request's client surface is decided. Surface drives plan
 * gates and capability preambles, so it is bound to the verified credential:
 * an API key is always `api`, a developer credential pins a developer surface,
 * and a Clerk token counts only for the surface its signed claims bind it to,
 * no matter what the advisory `x-agi-surface`/`x-client` header claims.
 * Consumers must call this instead of re-reading the header, or the plan gate
 * and the code behind it can disagree about who is calling.
 */
export function resolveAuthenticatedSurface(
  request: NextRequest,
  credential: SurfaceCredential,
): CloudChatSurface {
  const isApiKey =
    credential.token.startsWith('sk_live_') || credential.token.startsWith('sk_test_');
  return isApiKey
    ? 'api'
    : resolveCloudChatSurface(request, credential.surfaceClass, credential.boundSurface);
}

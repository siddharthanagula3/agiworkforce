import { NextResponse, type NextRequest } from 'next/server';
import { BILLING_PLAN_PRICING, billingPlanCapabilityUpgradeMessage } from '@agiworkforce/types';
import {
  canUseManagedCloudChatSurface,
  getCloudChatSurfaceCapability,
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

export function managedCloudSurfaceRefusal(
  planTier: string | null | undefined,
  surface: CloudChatSurface,
  headers?: Record<string, string>,
): NextResponse | null {
  if (canUseManagedCloudChatSurface(planTier, surface)) return null;

  const capability = getCloudChatSurfaceCapability(surface);
  const error =
    capability === null
      ? {
          message:
            'This credential is not bound to an AGI client. Use the AGI web, desktop or mobile app, the browser extension, the CLI or the IDE extension, or an API key.',
          code: 'managed_cloud_surface_unknown',
        }
      : capability === 'developer_surfaces'
        ? {
            message: billingPlanCapabilityUpgradeMessage('developer_surfaces'),
            code: 'developer_surface_plan_required',
            requiredTier: 'pro',
          }
        : capability === 'managed_api'
          ? {
              message: `Managed API access requires ${BILLING_PLAN_PRICING.pro.label} or higher.`,
              code: 'managed_api_plan_required',
              requiredTier: 'pro',
            }
          : {
              message: 'Managed Cloud chat is not available on this plan.',
              code: 'managed_chat_plan_required',
            };

  return NextResponse.json(
    { error: { ...error, type: 'invalid_request_error' } },
    { status: 403, ...(headers ? { headers } : {}) },
  );
}

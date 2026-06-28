import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const MANAGED_COMPUTE_PRIVATE_BETA_ENV = 'AGI_MANAGED_COMPUTE_PRIVATE_BETA';
export const MANAGED_COMPUTE_BETA_HEADER = 'x-agi-managed-compute-beta';
export const MANAGED_COMPUTE_ORG_HEADER = 'x-agi-organization-id';

export interface ManagedComputeDescriptor {
  provider: string;
  model: string;
  feature?: string;
  /**
   * When true, this request is a free-tier trial prompt. Free trial prompts
   * are always allowed through regardless of the private-beta flag so that
   * brand-new users can experience the product without an infra gate in the way.
   * Set this only after the auth gate has confirmed the subscription is 'free'
   * and the model is in the economy allow-list.
   */
  isFreeTrial?: boolean;
}

function headerValue(request: NextRequest, name: string): string | null {
  return request.headers.get(name);
}

// Public Alpha (2026-06-27): managed compute is GA/open by default — the
// private-beta launch gate has been removed. The env var is retained ONLY as an
// optional kill-switch for incident response: set
// AGI_MANAGED_COMPUTE_PRIVATE_BETA=0 (or 'false'/'off') to re-gate. Any other
// value (including unset or '1') keeps managed compute open.
export function isManagedComputePrivateBetaEnabled(): boolean {
  const raw = process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV]?.trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

export function buildManagedComputeGateResponse(
  request: NextRequest,
  descriptor: ManagedComputeDescriptor,
  headers?: HeadersInit,
): NextResponse | null {
  const base = {
    provider: descriptor.provider,
    model: descriptor.model,
    feature: descriptor.feature ?? 'managed_compute',
    organization_id: headerValue(request, MANAGED_COMPUTE_ORG_HEADER) ?? 'unscoped',
    checked_at: new Date().toISOString(),
  };

  if (!isManagedComputePrivateBetaEnabled()) {
    // Free-trial prompts are always allowed through so new users can chat
    // without needing the private-beta env var. All other managed-compute
    // requests are gated until the flag is set.
    if (descriptor.isFreeTrial) {
      logger.info(
        { feature: base.feature, model: base.model },
        '[managed-compute-gate] free-trial request allowed through without private-beta flag',
      );
      return null;
    }

    return NextResponse.json(
      {
        error: {
          message:
            'Managed compute is temporarily unavailable. Use Local or BYOK in the meantime, or try again shortly.',
          type: 'managed_compute_private_beta',
          code: 'public_launch_blocked',
        },
        managed_compute: { ...base, allowed: false },
      },
      { status: 403, headers },
    );
  }

  return null;
}

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { MANAGED_CLOUD_ORGANIZATION_HEADER } from '@agiworkforce/cloud-contracts';
import { logger } from '@/lib/logger';

export const MANAGED_COMPUTE_PRIVATE_BETA_ENV = 'AGI_MANAGED_COMPUTE_PRIVATE_BETA';
export const MANAGED_COMPUTE_BETA_HEADER = 'x-agi-managed-compute-beta';
export const MANAGED_COMPUTE_ORG_HEADER = MANAGED_CLOUD_ORGANIZATION_HEADER;

export interface ManagedComputeDescriptor {
  provider: string;
  model: string;
  feature?: string;
  isFreeTrial?: boolean;
}

function headerValue(request: NextRequest, name: string): string | null {
  return request.headers.get(name);
}

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
    logger.warn(
      { feature: base.feature, model: base.model, isFreeTrial: descriptor.isFreeTrial === true },
      '[managed-compute-gate] kill-switch engaged; refusing managed compute',
    );

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

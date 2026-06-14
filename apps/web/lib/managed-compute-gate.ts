import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

export const MANAGED_COMPUTE_PRIVATE_BETA_ENV = 'AGI_MANAGED_COMPUTE_PRIVATE_BETA';
export const MANAGED_COMPUTE_BETA_HEADER = 'x-agi-managed-compute-beta';
export const MANAGED_COMPUTE_ORG_HEADER = 'x-agi-organization-id';

export interface ManagedComputeDescriptor {
  provider: string;
  model: string;
  feature?: string;
}

function headerValue(request: NextRequest, name: string): string | null {
  return request.headers.get(name);
}

export function isManagedComputePrivateBetaEnabled(): boolean {
  return process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] === '1';
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
    return NextResponse.json(
      {
        error: {
          message: 'Managed compute is private beta only.',
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

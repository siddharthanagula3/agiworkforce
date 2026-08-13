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
    // NO CARVE-OUTS. Free-trial requests used to be allowed through here, and
    // that was correct while this flag was the private-beta LAUNCH GATE: the
    // point was to let new users chat without the env var being set.
    //
    // The 2026-06-27 decision removed the launch gate and repurposed the same
    // flag as the incident-response kill-switch. The exemption was not
    // revisited, so the two surfaces disagreed about what "engaged" meant —
    // services/api-gateway/src/middleware/managedComputeGate.ts blocked
    // everything while this one kept serving free-trial traffic. An operator
    // flipping the switch during a cost runaway or abuse wave got desktop, CLI
    // and VS Code stopped and web still serving, for exactly the traffic class
    // that is cheapest to create in bulk.
    //
    // A kill-switch that leaves a class flowing is the failure mode
    // kill-switches exist to avoid. Founder decision 2026-08-08: engaging it
    // stops new-user onboarding too. That is strictly more disruptive, and it
    // is the intended trade.
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

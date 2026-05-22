/**
 * Managed compute launch gate.
 *
 * This middleware intentionally fails closed. AGI-held provider keys must not
 * be reachable just because a user has a paid subscription; managed compute
 * needs an explicit private-beta gate until reservation, settlement, fraud,
 * refund, dispute, retention, and provider-term controls are fully wired.
 */

import type { NextFunction, Request, Response } from 'express';
import type {
  ManagedComputeDenialCode,
  ManagedComputeEligibility,
  Provider,
} from '@agiworkforce/types';
import { logger } from '../lib/logger';

export const MANAGED_COMPUTE_PRIVATE_BETA_ENV = 'AGI_MANAGED_COMPUTE_PRIVATE_BETA';
export const MANAGED_COMPUTE_BETA_HEADER = 'x-agi-managed-compute-beta';
export const MANAGED_COMPUTE_ORG_HEADER = 'x-agi-organization-id';

export interface ManagedComputeDescriptor {
  provider: Provider | string;
  model: string;
  organizationId?: string | null;
}

export type ManagedComputeDescriptorResolver = (req: Request) => ManagedComputeDescriptor;

declare global {
  namespace Express {
    interface Request {
      managedComputeEligibility?: ManagedComputeEligibility;
    }
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function denial(
  req: Request,
  descriptor: ManagedComputeDescriptor,
  denialCode: ManagedComputeDenialCode,
  denialMessage: string,
): ManagedComputeEligibility {
  return {
    allowed: false,
    organizationId:
      descriptor.organizationId ??
      firstHeaderValue(req.headers[MANAGED_COMPUTE_ORG_HEADER]) ??
      'unscoped',
    userId: req.user?.userId ?? 'anonymous',
    privacyMode: 'managed',
    provider: descriptor.provider,
    model: descriptor.model,
    accountStatus: 'waitlisted',
    denialCode,
    denialMessage,
    checkedAt: new Date().toISOString(),
  };
}

function allowed(req: Request, descriptor: ManagedComputeDescriptor): ManagedComputeEligibility {
  return {
    allowed: true,
    organizationId:
      descriptor.organizationId ??
      firstHeaderValue(req.headers[MANAGED_COMPUTE_ORG_HEADER]) ??
      'private-beta',
    userId: req.user?.userId ?? 'anonymous',
    privacyMode: 'managed',
    provider: descriptor.provider,
    model: descriptor.model,
    accountStatus: 'private_beta',
    checkedAt: new Date().toISOString(),
  };
}

export function isManagedComputePrivateBetaEnabled(): boolean {
  return process.env[MANAGED_COMPUTE_PRIVATE_BETA_ENV] === '1';
}

export function buildManagedComputeEligibility(
  req: Request,
  descriptor: ManagedComputeDescriptor,
): ManagedComputeEligibility {
  if (!isManagedComputePrivateBetaEnabled()) {
    return denial(
      req,
      descriptor,
      'public_launch_blocked',
      'Managed compute is waitlisted and private beta only.',
    );
  }

  const betaHeader = firstHeaderValue(req.headers[MANAGED_COMPUTE_BETA_HEADER]);
  if (betaHeader !== '1') {
    return denial(
      req,
      descriptor,
      'not_private_beta',
      'Managed compute requires an approved private-beta request.',
    );
  }

  return allowed(req, descriptor);
}

export function requireManagedComputeEligibility(
  resolveDescriptor: ManagedComputeDescriptorResolver,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    let descriptor: ManagedComputeDescriptor;
    try {
      descriptor = resolveDescriptor(req);
    } catch (err) {
      logger.warn({ err, userId: req.user.userId }, 'Managed compute descriptor failed');
      res.status(400).json({
        error: 'Managed compute request is malformed.',
        code: 'MANAGED_COMPUTE_DESCRIPTOR_INVALID',
      });
      return;
    }

    const eligibility = buildManagedComputeEligibility(req, descriptor);
    req.managedComputeEligibility = eligibility;

    if (!eligibility.allowed) {
      logger.warn(
        {
          userId: req.user.userId,
          provider: descriptor.provider,
          model: descriptor.model,
          denialCode: eligibility.denialCode,
        },
        'Managed compute request denied',
      );
      res.status(403).json({
        error: eligibility.denialMessage,
        code: eligibility.denialCode,
        managed_compute: {
          allowed: false,
          provider: eligibility.provider,
          model: eligibility.model,
          checked_at: eligibility.checkedAt,
        },
      });
      return;
    }

    next();
  };
}

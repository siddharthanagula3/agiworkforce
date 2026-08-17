import { z } from 'zod';
import {
  CAPABILITY_LAYERS,
  CAPABILITY_LIMIT_UNITS,
  CAPABILITY_LIMIT_WINDOWS,
} from '@agiworkforce/types';

export const CapabilityLayerSchema = z.enum(CAPABILITY_LAYERS);

export const CapabilityLimitSchema = z.object({
  id: z.string().min(1),
  capabilityId: z.string().nullable(),
  limit: z.number().nullable(),
  unit: z.enum(CAPABILITY_LIMIT_UNITS),
  window: z.enum(CAPABILITY_LIMIT_WINDOWS),
  resetsAt: z.string().nullable(),
  policySource: z.string().min(1),
});

export const EffectiveCapabilityDocumentSchema = z.object({
  sessionId: z.string().min(1),
  version: z.string().min(1),
  computedAt: z.string().min(1),
  sources: z.object({
    model: z.string(),
    tier: z.string(),
    surface: z.string(),
    settings: z.string(),
  }),
  granted: z.array(z.string()),
  deniedBy: z.record(z.string(), z.array(CapabilityLayerSchema)),
  limits: z.array(CapabilityLimitSchema).default([]),
});

export type EffectiveCapabilityDocumentWire = z.infer<typeof EffectiveCapabilityDocumentSchema>;

export function parseEffectiveCapabilityDocument(data: unknown): EffectiveCapabilityDocumentWire {
  return EffectiveCapabilityDocumentSchema.parse(data);
}

// The one account every surface's entitlement contract test resolves, so a
// divergence between web, mobile and desktop shows up as a failing assertion
// rather than as two surfaces quietly disagreeing about the same user.
export const CAPABILITY_CONTRACT_ACCOUNT = {
  userId: 'capability_contract_account',
  tier: 'pro',
  cloudExecutionDeploymentEnabled: true,
  computedAt: '2026-08-17T00:00:00.000Z',
  billingPeriodEndsAt: '2026-09-01T00:00:00.000Z',
  rollingFiveHourResetsAt: '2026-08-17T05:00:00.000Z',
  rollingWeeklyResetsAt: '2026-08-24T00:00:00.000Z',
} as const;

export const CAPABILITY_CONTRACT_EXPECTATIONS = {
  canUseDeepResearch: { allowed: false, policySource: 'tier:pro' },
  canUseWebSearch: { allowed: true, policySource: null },
  canUseCloudModels: { allowed: true, policySource: null },
} as const;

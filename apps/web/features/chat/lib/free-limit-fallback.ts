import {
  FREE_ALLOWANCE_EXHAUSTED_CODE,
  FREE_QUOTA_CATALOGUE_PATH,
  FreeQuotaCatalogueSchema,
  type FreeQuotaCatalogue,
} from '@agiworkforce/cloud-contracts';
import { getProviderOffering, getRoutingSlotModel } from '@agiworkforce/types';
import type { FreeTrialErrorCode } from '@/features/chat/stores/freeTrialStore';
import { FREE_CAPACITY_UNAVAILABLE_CODE } from './freeCapacityRecovery';
import { promotionalChatToolConflict } from './free-quota-selection';

const FREE_USAGE_LIMIT_CODE: FreeTrialErrorCode = 'free_trial_token_budget_reached';

export const FREE_LIMIT_FALLBACK_REASON = 'free_limit_reached';
export const FREE_CAPACITY_FALLBACK_REASON = 'free_capacity_unavailable';
export const FREE_USAGE_LIMIT_FALLBACK_REASON = 'free_usage_limit_reached';

const FALLBACK_REASON_BY_CODE: Readonly<Record<string, string>> = {
  [FREE_ALLOWANCE_EXHAUSTED_CODE]: FREE_LIMIT_FALLBACK_REASON,
  [FREE_CAPACITY_UNAVAILABLE_CODE]: FREE_CAPACITY_FALLBACK_REASON,
  [FREE_USAGE_LIMIT_CODE]: FREE_USAGE_LIMIT_FALLBACK_REASON,
};

export interface FreeLimitFallbackTurn {
  requestedModel: string;
  code: string | undefined;
  draft: string;
  attachments: readonly { type: 'image' | 'file' }[];
  needsWebAccess: boolean;
  needsCodeExecution: boolean;
  needsTools: boolean;
}

export function freeLimitFallbackReason(turn: FreeLimitFallbackTurn): string | null {
  if (turn.requestedModel !== getRoutingSlotModel('router_zero_cost')) return null;
  return (turn.code && FALLBACK_REASON_BY_CODE[turn.code]) || null;
}

export function pickFreeLimitFallback(
  catalogue: FreeQuotaCatalogue | null,
  turn: FreeLimitFallbackTurn,
): string | null {
  if (!catalogue || turn.attachments.some((attachment) => attachment.type !== 'image')) {
    return null;
  }
  const needsImageInput = turn.attachments.length > 0;
  const candidate = catalogue.models.find((model) => {
    const offering = getProviderOffering(model.key);
    return (
      model.status === 'ready' &&
      model.category === 'chat' &&
      offering?.quotaProbeProtocol === 'chat' &&
      (!needsImageInput || offering.quotaChatImageInput === true)
    );
  });
  if (!candidate) return null;
  const conflict = promotionalChatToolConflict(candidate.key, turn.draft, {
    webSearchEnabled: turn.needsWebAccess,
    codeExecutionEnabled: turn.needsCodeExecution,
    needsTools: turn.needsTools,
  });
  return conflict ? null : candidate.key;
}

export async function loadFreeQuotaCatalogue(
  signal?: AbortSignal,
): Promise<FreeQuotaCatalogue | null> {
  const response = await fetch(FREE_QUOTA_CATALOGUE_PATH, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) return null;
  const parsed = FreeQuotaCatalogueSchema.nullable().safeParse(await response.json());
  return parsed.success ? parsed.data : null;
}

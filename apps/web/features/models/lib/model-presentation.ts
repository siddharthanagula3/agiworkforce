import {
  evaluateModelEnvironment,
  formatCredits,
  formatCreditsPerMillionTokens,
} from '@agiworkforce/types';
import { getModelMetadata } from '@shared/config/llm';
import { formatTokenCount } from '@features/code/code-surface';
import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';

export const UNPUBLISHED_VALUE = 'Not published';

export function modelSummary(entry: ModelCatalogueEntry): string {
  const bestFor = getModelMetadata(entry.id)?.bestFor ?? [];
  return bestFor.slice(0, 3).join(' · ');
}

export function tokenCeilingLabel(tokens: number | null): string {
  if (tokens === null || tokens <= 0) return UNPUBLISHED_VALUE;
  return `${formatTokenCount(tokens)} tokens`;
}

export function creditsPerMillionLabel(usdPerMillion: number): string {
  if (!Number.isFinite(usdPerMillion) || usdPerMillion <= 0) return UNPUBLISHED_VALUE;
  return formatCredits(formatCreditsPerMillionTokens(usdPerMillion));
}

export function accessLabel(entry: ModelCatalogueEntry, planLabel: string): string {
  if (entry.eventAccess) return 'Free during event';
  if (entry.admitted) return planLabel ? `Included in ${planLabel}` : 'Included in your plan';
  return entry.minimumPlanLabel ? `${entry.minimumPlanLabel} and above` : 'Not available';
}

function environmentLock(entry: ModelCatalogueEntry): { selectable: boolean; reason?: string } {
  return evaluateModelEnvironment(entry.requiresEnvironment ?? undefined, undefined);
}

export function statusLabel(entry: ModelCatalogueEntry): string | null {
  if (entry.temporarilyUnavailable) return 'Temporarily unavailable';
  if (entry.availability !== 'live') return 'Coming soon';
  const environment = environmentLock(entry);
  if (!environment.selectable) return environment.reason ?? null;
  return null;
}

export function isSelectable(entry: ModelCatalogueEntry): boolean {
  return (
    entry.admitted &&
    !entry.temporarilyUnavailable &&
    entry.availability === 'live' &&
    environmentLock(entry).selectable
  );
}

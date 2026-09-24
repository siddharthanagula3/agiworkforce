import { evaluateModelEnvironment } from '@agiworkforce/types';
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

/**
 * Says when a still-selectable model stops being offered. A model that has
 * already passed its date keeps the notice in the past tense rather than
 * dropping it, because it is still in the catalogue and still selectable.
 */
export function retirementLabel(entry: ModelCatalogueEntry, now: Date = new Date()): string | null {
  const deprecatedOn = entry.deprecatedOn;
  if (!deprecatedOn) return null;
  const date = new Date(`${deprecatedOn}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return date.getTime() <= now.getTime() ? `Retired ${formatted}` : `Retiring ${formatted}`;
}

export function isSelectable(entry: ModelCatalogueEntry): boolean {
  return (
    entry.admitted &&
    !entry.temporarilyUnavailable &&
    entry.availability === 'live' &&
    environmentLock(entry).selectable
  );
}

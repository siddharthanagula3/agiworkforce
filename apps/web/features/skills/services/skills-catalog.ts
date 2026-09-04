'use client';

import {
  ManagedSkillsResponseSchema,
  type ManagedSkillSummary,
} from '@agiworkforce/cloud-contracts';
import { SKILL_CATALOG_CHANGED_EVENT } from '@shared/events/skill-catalog-events';
import { queryClient, queryKeys } from '@shared/stores/query-client';

/**
 * The shared query client dedupes concurrent mounts and caches the catalogue
 * for its default staleTime, so the composer and the settings modal rendering
 * together (or a page remounting on conversation switch) issue one request
 * instead of one each.
 */
let canAuthorSkills = false;

/** Carries the HTTP status so callers can say what actually failed. */
export class SkillsCatalogError extends Error {
  constructor(readonly status: number | null) {
    super(`skills catalog failed: ${status ?? 'network'}`);
  }
}

async function request(): Promise<ManagedSkillSummary[]> {
  const response = await fetch('/api/skills', { cache: 'no-store' });
  if (!response.ok) throw new SkillsCatalogError(response.status);
  const raw = await response.json();
  const parsed = ManagedSkillsResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error('Invalid skills response');
  canAuthorSkills = raw?.canAuthorSkills === true;
  return parsed.data.skills;
}

export function skillAuthoringCapability(): boolean {
  return canAuthorSkills;
}

export function loadSkillsCatalog(): Promise<ManagedSkillSummary[]> {
  return queryClient.fetchQuery({
    queryKey: queryKeys.skills.catalog(),
    queryFn: request,
    meta: { silent: true },
  });
}

export function invalidateSkillsCatalog(): void {
  canAuthorSkills = false;
  void queryClient.removeQueries({ queryKey: queryKeys.skills.catalog() });
}

if (typeof window !== 'undefined') {
  window.addEventListener(SKILL_CATALOG_CHANGED_EVENT, invalidateSkillsCatalog);
}

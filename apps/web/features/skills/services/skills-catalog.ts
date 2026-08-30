'use client';

import {
  ManagedSkillsResponseSchema,
  type ManagedSkillSummary,
} from '@agiworkforce/cloud-contracts';
import { SKILL_CATALOG_CHANGED_EVENT } from '@shared/events/skill-catalog-events';

/**
 * One in-flight request for the skill catalogue, shared by every consumer.
 * The composer and the settings modal each fetched `/api/skills` on their own,
 * so a page rendering both issued the same request up to four times.
 */
let inFlight: Promise<ManagedSkillSummary[]> | null = null;
let loadedAt = 0;

/**
 * Long enough to collapse the mount storm that made a single page issue four
 * identical requests, short enough that the catalogue is not frozen for the
 * session when it changes outside this tab.
 */
const CATALOG_TTL_MS = 30_000;

/** Carries the HTTP status so callers can say what actually failed. */
export class SkillsCatalogError extends Error {
  constructor(readonly status: number | null) {
    super(`skills catalog failed: ${status ?? 'network'}`);
  }
}

async function request(): Promise<ManagedSkillSummary[]> {
  const response = await fetch('/api/skills', { cache: 'no-store' });
  if (!response.ok) throw new SkillsCatalogError(response.status);
  const parsed = ManagedSkillsResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Invalid skills response');
  return parsed.data.skills;
}

export function loadSkillsCatalog(): Promise<ManagedSkillSummary[]> {
  const now = Date.now();
  if (inFlight && now - loadedAt < CATALOG_TTL_MS) return inFlight;
  loadedAt = now;
  inFlight = request().catch((error: unknown) => {
    // A failed load must not be cached, or every later consumer inherits the
    // failure with no way to retry.
    inFlight = null;
    loadedAt = 0;
    throw error;
  });
  return inFlight;
}

export function invalidateSkillsCatalog(): void {
  inFlight = null;
  loadedAt = 0;
}

if (typeof window !== 'undefined') {
  window.addEventListener(SKILL_CATALOG_CHANGED_EVENT, invalidateSkillsCatalog);
}

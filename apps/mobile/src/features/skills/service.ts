import { FEATURES } from '@/lib/v1FeatureFlags';
import { api } from '@/services/api';
import {
  ManagedSkillsResponseSchema,
  type ManagedSkillSource,
  type ManagedSkillSummary,
} from '@agiworkforce/cloud-contracts';

export type { ManagedSkillSource, ManagedSkillSummary } from '@agiworkforce/cloud-contracts';

export function parseManagedSkillsResponse(value: unknown): ManagedSkillSummary[] {
  const parsed = ManagedSkillsResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('Skills returned an invalid response.');
  }
  return parsed.data.skills;
}

/**
 * Read the authenticated deployment's Managed Cloud Skill catalog.
 *
 * Mobile may select an included Skill for a Cloud turn. Installing or mutating
 * filesystem-backed Skills remains a host/admin operation and is not
 * represented as a Mobile action.
 */
export async function fetchManagedSkills(signal?: AbortSignal): Promise<ManagedSkillSummary[]> {
  if (!FEATURES.skills) {
    throw new Error('Skills are not available on Mobile.');
  }

  const response = await api.get<unknown>('/api/skills', { signal });
  return parseManagedSkillsResponse(response);
}

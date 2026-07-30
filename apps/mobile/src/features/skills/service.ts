import { FEATURES } from '@/lib/v1FeatureFlags';
import { api } from '@/services/api';

export const MANAGED_SKILL_SOURCES = [
  'bundled',
  'managed-local',
  'personal',
  'project',
  'workspace',
  'extra',
] as const;

export type ManagedSkillSource = (typeof MANAGED_SKILL_SOURCES)[number];

export interface ManagedSkillSummary {
  name: string;
  description: string;
  source: ManagedSkillSource;
}

const skillSources = new Set<string>(MANAGED_SKILL_SOURCES);

function isManagedSkillSummary(value: unknown): value is ManagedSkillSummary {
  if (!value || typeof value !== 'object') return false;
  const skill = value as Record<string, unknown>;
  return (
    typeof skill.name === 'string' &&
    skill.name.trim().length > 0 &&
    typeof skill.description === 'string' &&
    typeof skill.source === 'string' &&
    skillSources.has(skill.source)
  );
}

export function parseManagedSkillsResponse(value: unknown): ManagedSkillSummary[] {
  if (!value || typeof value !== 'object') {
    throw new Error('Skills returned an invalid response.');
  }

  const skills = (value as Record<string, unknown>).skills;
  if (!Array.isArray(skills) || !skills.every(isManagedSkillSummary)) {
    throw new Error('Skills returned an invalid response.');
  }

  return skills.map((skill) => ({
    name: skill.name.trim(),
    description: skill.description.trim(),
    source: skill.source,
  }));
}

/**
 * Read the authenticated deployment's Managed Cloud Skill catalog.
 *
 * Mobile intentionally exposes this as a read-only catalog. Installing or
 * mutating filesystem-backed Skills is a host/admin operation and is not
 * represented as a Mobile action.
 */
export async function fetchManagedSkills(signal?: AbortSignal): Promise<ManagedSkillSummary[]> {
  if (!FEATURES.skills) {
    throw new Error('Skills are not available on Mobile.');
  }

  const response = await api.get<unknown>('/api/skills', { signal });
  return parseManagedSkillsResponse(response);
}

import { FREE_TRIAL_GATEWAY } from './freeTrialClient';
import { platformRequestHeaders } from '../../platformHeaders';

export const ACCOUNT_SKILLS_PATH = '/api/skills';
const CATALOG_SKILL_SOURCE = 'bundled';
const MAX_SKILL_NAME_CHARS = 200;

export interface AccountSkill {
  name: string;
  description: string;
}

export function isSkillName(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const name = value.trim();
  return (
    name.length > 0 &&
    name.length <= MAX_SKILL_NAME_CHARS &&
    name === value &&
    !name.includes('/') &&
    !name.includes('\\') &&
    Array.from(name).every((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
  );
}

export async function fetchOwnSkills(token: string, signal?: AbortSignal): Promise<AccountSkill[]> {
  const response = await fetch(`${FREE_TRIAL_GATEWAY}${ACCOUNT_SKILLS_PATH}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
    },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error('Your skills could not be loaded. Try again.');
  const body = (await response.json()) as { skills?: unknown };
  if (!Array.isArray(body.skills)) throw new Error('Your skills could not be loaded. Try again.');
  return body.skills.flatMap((entry): AccountSkill[] => {
    if (!entry || typeof entry !== 'object') return [];
    const { name, description, source } = entry as Record<string, unknown>;
    if (source === CATALOG_SKILL_SOURCE || !isSkillName(name)) return [];
    return [{ name, description: typeof description === 'string' ? description : '' }];
  });
}

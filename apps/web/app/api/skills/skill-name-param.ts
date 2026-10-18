import { createError } from '@/lib/errors';

const SKILL_NAME_MAX_LENGTH = 200;

export function requireSkillName(name: string | undefined): string {
  if (!name || name.length > SKILL_NAME_MAX_LENGTH) {
    throw createError.validation(`skill name is required (1–${SKILL_NAME_MAX_LENGTH} chars)`);
  }
  return name;
}

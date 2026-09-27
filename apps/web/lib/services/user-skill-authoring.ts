import 'server-only';

import { createError } from '@/lib/errors';

export const USER_SKILL_AUTHORING_ENV_VAR = 'AGI_USER_SKILL_AUTHORING';

const USER_SKILL_AUTHORING_DISABLED_MESSAGE = 'Skill authoring is not available.';

export function userSkillAuthoringEnabled(): boolean {
  return process.env[USER_SKILL_AUTHORING_ENV_VAR] === '1';
}

export function requireUserSkillAuthoring(): void {
  if (!userSkillAuthoringEnabled()) {
    throw createError.notFound(USER_SKILL_AUTHORING_DISABLED_MESSAGE);
  }
}

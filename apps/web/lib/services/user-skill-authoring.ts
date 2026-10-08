import 'server-only';

import { createError } from '@/lib/errors';

export const USER_SKILL_AUTHORING_ENV_VAR = 'AGI_USER_SKILL_AUTHORING';
export const USER_SKILL_AUTHORING_OFF = '0';

const USER_SKILL_AUTHORING_DISABLED_MESSAGE = 'Skill authoring is not available.';

export function userSkillAuthoringEnabled(): boolean {
  return process.env[USER_SKILL_AUTHORING_ENV_VAR] !== USER_SKILL_AUTHORING_OFF;
}

export function requireUserSkillAuthoring(): void {
  if (!userSkillAuthoringEnabled()) {
    throw createError.notFound(USER_SKILL_AUTHORING_DISABLED_MESSAGE);
  }
}

import 'server-only';

export const USER_SKILL_AUTHORING_ENV_VAR = 'AGI_USER_SKILL_AUTHORING';

export function userSkillAuthoringEnabled(): boolean {
  return process.env[USER_SKILL_AUTHORING_ENV_VAR] === '1';
}

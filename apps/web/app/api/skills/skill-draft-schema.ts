import { z } from 'zod';

import {
  SKILL_DRAFT_BODY_MAX_LENGTH,
  SKILL_DRAFT_DESCRIPTION_MAX_LENGTH,
  SKILL_DRAFT_NAME_MAX_LENGTH,
} from '@agiworkforce/skills';

export const SkillDraftBodySchema = z
  .object({
    name: z.string().trim().min(1).max(SKILL_DRAFT_NAME_MAX_LENGTH),
    description: z.string().trim().min(1).max(SKILL_DRAFT_DESCRIPTION_MAX_LENGTH),
    body: z.string().trim().min(1).max(SKILL_DRAFT_BODY_MAX_LENGTH),
  })
  .strict();

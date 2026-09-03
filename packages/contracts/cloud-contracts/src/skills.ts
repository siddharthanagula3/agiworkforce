import { z } from 'zod';

export const MANAGED_SKILL_SOURCES = [
  'bundled',
  'managed-local',
  'personal',
  'project',
  'workspace',
  'extra',
] as const;

export const MANAGED_SKILL_LIFECYCLES = ['included', 'draft'] as const;

export const ManagedSkillSourceSchema = z.enum(MANAGED_SKILL_SOURCES);
export const ManagedSkillLifecycleSchema = z.enum(MANAGED_SKILL_LIFECYCLES);

export const ManagedSkillSummarySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim(),
    source: ManagedSkillSourceSchema,
    lifecycle: ManagedSkillLifecycleSchema,
    downloadable: z.boolean(),
    /**
     * Version from the bundle's own SKILL.md frontmatter. Optional because a
     * skill without one must render as unknown rather than as a number this
     * layer invented.
     */
    version: z.string().trim().max(40).optional(),
    /**
     * True only for a skill this account authored through the web editor.
     * Absent (not false) for every other surface, so a consumer that never
     * heard of editing renders exactly as before.
     */
    editable: z.boolean().optional(),
  })
  .superRefine((skill, context) => {
    if (skill.downloadable && (skill.source !== 'bundled' || skill.lifecycle !== 'included')) {
      context.addIssue({
        code: 'custom',
        path: ['downloadable'],
        message: 'Only included bundled Skills may be downloaded',
      });
    }
  });

export const ManagedSkillsResponseSchema = z.object({
  skills: z.array(ManagedSkillSummarySchema),
});

export type ManagedSkillSource = z.infer<typeof ManagedSkillSourceSchema>;
export type ManagedSkillLifecycle = z.infer<typeof ManagedSkillLifecycleSchema>;
export type ManagedSkillSummary = z.infer<typeof ManagedSkillSummarySchema>;
export type ManagedSkillsResponse = z.infer<typeof ManagedSkillsResponseSchema>;

export function parseManagedSkillsResponse(data: unknown): ManagedSkillsResponse {
  return ManagedSkillsResponseSchema.parse(data);
}

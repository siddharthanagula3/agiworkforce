
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

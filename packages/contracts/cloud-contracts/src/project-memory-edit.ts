import { z } from 'zod';

export const PROJECT_MEMORY_EDIT_MAX_MESSAGE_CHARS = 2_000;

export const ProjectMemoryEditRequestSchema = z.object({
  message: z.string().trim().min(1).max(PROJECT_MEMORY_EDIT_MAX_MESSAGE_CHARS),
});
export type ProjectMemoryEditRequest = z.infer<typeof ProjectMemoryEditRequestSchema>;

const ProjectMemoryEditRowFields = {
  id: z.string().min(1),
  content: z.string().trim().min(1),
};

export const ProjectMemoryEditChangeSchema = z.object({
  ...ProjectMemoryEditRowFields,
  action: z.enum(['added', 'updated']),
});
export type ProjectMemoryEditChange = z.infer<typeof ProjectMemoryEditChangeSchema>;

export const ProjectMemoryEditRemovalSchema = z.object(ProjectMemoryEditRowFields);
export type ProjectMemoryEditRemoval = z.infer<typeof ProjectMemoryEditRemovalSchema>;

export const ProjectMemoryEditResponseSchema = z.object({
  changed: z.array(ProjectMemoryEditChangeSchema),
  removals: z.array(ProjectMemoryEditRemovalSchema),
  reply: z.string().trim(),
});
export type ProjectMemoryEditResponse = z.infer<typeof ProjectMemoryEditResponseSchema>;

export const ProjectMemoryEditHandshakeSchema = z.object({
  maxMessageChars: z.number().int().positive(),
});
export type ProjectMemoryEditHandshake = z.infer<typeof ProjectMemoryEditHandshakeSchema>;

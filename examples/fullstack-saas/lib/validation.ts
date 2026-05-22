import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().nullable(),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().max(4000).optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  due_at: z.string().datetime().optional().nullable(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(2).max(160).optional(),
    body: z.string().trim().max(4000).optional().nullable(),
    status: z.enum(['todo', 'doing', 'blocked', 'done']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    due_at: z.string().datetime().optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const signedUploadSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .regex(/^[a-zA-Z0-9._ -]+$/),
  contentType: z.string().trim().min(3).max(120),
});

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

import { z } from 'zod';

export const MANAGED_MEMORY_SUMMARY_PATH = '/api/memory/summary';

export const MEMORY_SUMMARY_MAX_LINES = 6;

export const MEMORY_SUMMARY_MAX_LINE_CHARS = 240;

const SummaryLineSchema = z.string().trim().min(1).max(MEMORY_SUMMARY_MAX_LINE_CHARS);

export const MemorySummarySchema = z.object({
  about: z.array(SummaryLineSchema).max(MEMORY_SUMMARY_MAX_LINES),
  preferences: z.array(SummaryLineSchema).max(MEMORY_SUMMARY_MAX_LINES),
});

export type MemorySummary = z.infer<typeof MemorySummarySchema>;

export const MemorySummaryResponseSchema = z.object({
  summary: MemorySummarySchema,
  memoryCount: z.number().int().nonnegative(),
  generatedAt: z.string().nullable(),
});

export type MemorySummaryResponse = z.infer<typeof MemorySummaryResponseSchema>;

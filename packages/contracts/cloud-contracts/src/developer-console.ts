import { z } from 'zod';

export const DEVELOPER_REQUEST_LOGS_PATH = '/api/developers/logs';
export const DEVELOPER_REQUEST_LOGS_PAGE_SIZE = 50;

export const DeveloperRequestLogStepSchema = z.object({
  name: z.enum(['received', 'provider_started', 'provider_answered', 'delivered', 'settled']),
  at: z.string(),
});
export type DeveloperRequestLogStep = z.infer<typeof DeveloperRequestLogStepSchema>;

export const DeveloperRequestLogSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  apiKeyName: z.string().nullable(),
  apiKeyPrefix: z.string().nullable(),
  status: z.string(),
  model: z.string(),
  servedModel: z.string().nullable(),
  errorCode: z.string().nullable(),
  credits: z.number().nullable(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  reasoningTokens: z.number().int().nullable(),
  cacheReadTokens: z.number().int().nullable(),
  webSearchRequests: z.number().int().nullable(),
  webFetchRequests: z.number().int().nullable(),
  codeExecutionRuns: z.number().int().nullable(),
  steps: z.array(DeveloperRequestLogStepSchema),
});
export type DeveloperRequestLog = z.infer<typeof DeveloperRequestLogSchema>;

export const DeveloperRequestLogPageSchema = z.object({
  logs: z.array(DeveloperRequestLogSchema),
  nextBefore: z.string().nullable(),
});
export type DeveloperRequestLogPage = z.infer<typeof DeveloperRequestLogPageSchema>;

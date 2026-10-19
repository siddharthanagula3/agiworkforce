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

export const DEVELOPER_PROMPTS_PATH = '/api/developers/prompts';
export const DEVELOPER_PROMPT_NAME_MAX_CHARS = 120;
export const DEVELOPER_PROMPT_TEXT_MAX_CHARS = 32_000;
export const DEVELOPER_PROMPT_NOTE_MAX_CHARS = 300;
export const DEVELOPER_EVAL_CASES_MAX = 500;
export const DEVELOPER_EVAL_CHECK_KINDS = ['exact', 'contains', 'none'] as const;
export const DEVELOPER_PROMPT_VARIABLE_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*\}\}/g;

export const DeveloperPromptVersionInputSchema = z.object({
  systemPrompt: z.string().max(DEVELOPER_PROMPT_TEXT_MAX_CHARS),
  template: z.string().min(1).max(DEVELOPER_PROMPT_TEXT_MAX_CHARS),
  model: z.string().trim().min(1).max(200),
  maxTokens: z.number().int().min(1).max(200_000).nullable(),
  temperature: z.number().min(0).max(2).nullable(),
  note: z.string().trim().max(DEVELOPER_PROMPT_NOTE_MAX_CHARS).nullable().optional(),
});
export type DeveloperPromptVersionInput = z.infer<typeof DeveloperPromptVersionInputSchema>;

export const DeveloperPromptVersionSchema = DeveloperPromptVersionInputSchema.extend({
  version: z.number().int().min(1),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type DeveloperPromptVersion = z.infer<typeof DeveloperPromptVersionSchema>;

export const DeveloperPromptSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  latest: DeveloperPromptVersionSchema.nullable(),
  caseCount: z.number().int().min(0),
  updatedAt: z.string(),
});
export type DeveloperPrompt = z.infer<typeof DeveloperPromptSchema>;

export const DeveloperPromptCreateSchema = z.object({
  name: z.string().trim().min(1).max(DEVELOPER_PROMPT_NAME_MAX_CHARS),
  version: DeveloperPromptVersionInputSchema,
});
export type DeveloperPromptCreate = z.infer<typeof DeveloperPromptCreateSchema>;

export const DeveloperPromptRenameSchema = z.object({
  name: z.string().trim().min(1).max(DEVELOPER_PROMPT_NAME_MAX_CHARS),
});

export const DeveloperPromptListSchema = z.object({ prompts: z.array(DeveloperPromptSchema) });
export const DeveloperPromptResponseSchema = z.object({ prompt: DeveloperPromptSchema });
export const DeveloperPromptVersionListSchema = z.object({
  versions: z.array(DeveloperPromptVersionSchema),
});

export const DeveloperEvalCaseInputSchema = z.object({
  variables: z.record(z.string().max(64), z.string().max(DEVELOPER_PROMPT_TEXT_MAX_CHARS)),
  expectedOutput: z.string().max(DEVELOPER_PROMPT_TEXT_MAX_CHARS).nullable(),
});
export type DeveloperEvalCaseInput = z.infer<typeof DeveloperEvalCaseInputSchema>;

export const DeveloperEvalCaseSchema = DeveloperEvalCaseInputSchema.extend({
  id: z.string().uuid(),
  position: z.number().int(),
});
export type DeveloperEvalCase = z.infer<typeof DeveloperEvalCaseSchema>;

export const DeveloperEvalCaseBatchSchema = z.object({
  cases: z.array(DeveloperEvalCaseInputSchema).min(1).max(DEVELOPER_EVAL_CASES_MAX),
});
export const DeveloperEvalCaseListSchema = z.object({ cases: z.array(DeveloperEvalCaseSchema) });

export const DeveloperEvalCheckKindSchema = z.enum(DEVELOPER_EVAL_CHECK_KINDS);
export type DeveloperEvalCheckKind = z.infer<typeof DeveloperEvalCheckKindSchema>;

export const DeveloperEvalRunCreateSchema = z.object({
  version: z.number().int().min(1),
  checkKind: DeveloperEvalCheckKindSchema,
});

export const DeveloperEvalResultInputSchema = z.object({
  caseId: z.string().uuid(),
  renderedInput: z.string().max(64_000),
  output: z.string().max(200_000).nullable(),
  error: z.string().max(2_000).nullable(),
  latencyMs: z.number().int().min(0).nullable(),
  inputTokens: z.number().int().min(0).nullable(),
  outputTokens: z.number().int().min(0).nullable(),
});
export type DeveloperEvalResultInput = z.infer<typeof DeveloperEvalResultInputSchema>;

export const DeveloperEvalResultSchema = DeveloperEvalResultInputSchema.extend({
  id: z.string().uuid(),
  caseId: z.string().uuid().nullable(),
  passed: z.boolean().nullable(),
  grade: z.number().int().min(1).max(5).nullable(),
});
export type DeveloperEvalResult = z.infer<typeof DeveloperEvalResultSchema>;

export const DeveloperEvalGradeSchema = z.object({
  grade: z.number().int().min(1).max(5).nullable(),
});

export const DeveloperEvalRunSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().min(1),
  checkKind: DeveloperEvalCheckKindSchema,
  caseCount: z.number().int().min(1),
  createdAt: z.string(),
  results: z.array(DeveloperEvalResultSchema),
});
export type DeveloperEvalRun = z.infer<typeof DeveloperEvalRunSchema>;

export const DeveloperEvalRunListSchema = z.object({
  runs: z.array(
    DeveloperEvalRunSchema.omit({ results: true }).extend({
      passed: z.number().int().min(0),
      failed: z.number().int().min(0),
      graded: z.number().int().min(0),
      averageGrade: z.number().nullable(),
    }),
  ),
});

export function promptTemplateVariables(template: string): string[] {
  const seen = new Set<string>();
  for (const match of template.matchAll(DEVELOPER_PROMPT_VARIABLE_PATTERN)) {
    if (match[1]) seen.add(match[1]);
  }
  return [...seen];
}

export function renderPromptTemplate(
  template: string,
  variables: Readonly<Record<string, string>>,
): string {
  return template.replace(DEVELOPER_PROMPT_VARIABLE_PATTERN, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? (variables[name] ?? '') : whole,
  );
}

export function evalCheckPasses(
  kind: DeveloperEvalCheckKind,
  output: string | null,
  expected: string | null,
): boolean | null {
  if (kind === 'none' || expected === null || expected.trim() === '' || output === null) {
    return null;
  }
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
  return kind === 'exact'
    ? normalize(output) === normalize(expected)
    : normalize(output).toLowerCase().includes(normalize(expected).toLowerCase());
}

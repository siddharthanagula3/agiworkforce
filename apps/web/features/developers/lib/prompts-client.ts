import {
  DEVELOPER_PROMPTS_PATH,
  DeveloperEvalCaseListSchema,
  DeveloperEvalCaseSchema,
  DeveloperEvalResultSchema,
  DeveloperEvalRunListSchema,
  DeveloperEvalRunSchema,
  DeveloperPromptListSchema,
  DeveloperPromptResponseSchema,
  DeveloperPromptVersionListSchema,
  type DeveloperEvalCase,
  type DeveloperEvalCaseInput,
  type DeveloperEvalCheckKind,
  type DeveloperEvalResult,
  type DeveloperEvalResultInput,
  type DeveloperEvalRun,
  type DeveloperPrompt,
  type DeveloperPromptVersion,
  type DeveloperPromptVersionInput,
} from '@agiworkforce/cloud-contracts';
import { z } from 'zod';

import { sendAuthorizedJson } from '@features/auth/step-up-fetch';
import { readDeveloperApiError } from '../hooks/use-developer-projects';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type EvalRunSummary = z.infer<typeof DeveloperEvalRunListSchema>['runs'][number];

async function call<T>(
  schema: z.ZodType<T> | null,
  path: string,
  method: Method,
  body?: unknown,
  failure = 'The request failed.',
): Promise<T> {
  const response = await sendAuthorizedJson(path, {
    method,
    ...(body === undefined ? {} : { body }),
  });
  if (!response.ok) throw new Error(await readDeveloperApiError(response, failure));
  if (!schema) return undefined as T;
  return schema.parse(await response.json());
}

const CaseResponse = z.object({ case: DeveloperEvalCaseSchema });
const RunResponse = z.object({ run: DeveloperEvalRunSchema });
const ResultResponse = z.object({ result: DeveloperEvalResultSchema });

const promptPath = (promptId: string, leaf = '') =>
  `${DEVELOPER_PROMPTS_PATH}/${encodeURIComponent(promptId)}${leaf ? `/${leaf}` : ''}`;

export interface PromptsApi {
  list(): Promise<DeveloperPrompt[]>;
  create(name: string, version: DeveloperPromptVersionInput): Promise<DeveloperPrompt>;
  remove(promptId: string): Promise<void>;
  versions(promptId: string): Promise<DeveloperPromptVersion[]>;
  saveVersion(promptId: string, version: DeveloperPromptVersionInput): Promise<DeveloperPrompt>;
  cases(promptId: string): Promise<DeveloperEvalCase[]>;
  addCases(promptId: string, cases: DeveloperEvalCaseInput[]): Promise<DeveloperEvalCase[]>;
  updateCase(
    promptId: string,
    caseId: string,
    input: DeveloperEvalCaseInput,
  ): Promise<DeveloperEvalCase>;
  removeCase(promptId: string, caseId: string): Promise<void>;
  runs(promptId: string): Promise<EvalRunSummary[]>;
  startRun(
    promptId: string,
    version: number,
    checkKind: DeveloperEvalCheckKind,
  ): Promise<DeveloperEvalRun>;
  run(promptId: string, runId: string): Promise<DeveloperEvalRun>;
  recordResult(
    promptId: string,
    runId: string,
    input: DeveloperEvalResultInput,
  ): Promise<DeveloperEvalResult>;
  grade(
    promptId: string,
    runId: string,
    resultId: string,
    grade: number | null,
  ): Promise<DeveloperEvalResult>;
}

export const promptsApi: PromptsApi = {
  list: async () => (await call(DeveloperPromptListSchema, DEVELOPER_PROMPTS_PATH, 'GET')).prompts,
  create: async (name, version) =>
    (await call(DeveloperPromptResponseSchema, DEVELOPER_PROMPTS_PATH, 'POST', { name, version }))
      .prompt,
  remove: (promptId) => call(null, promptPath(promptId), 'DELETE'),
  versions: async (promptId) =>
    (await call(DeveloperPromptVersionListSchema, promptPath(promptId, 'versions'), 'GET'))
      .versions,
  saveVersion: async (promptId, version) =>
    (await call(DeveloperPromptResponseSchema, promptPath(promptId, 'versions'), 'POST', version))
      .prompt,
  cases: async (promptId) =>
    (await call(DeveloperEvalCaseListSchema, promptPath(promptId, 'cases'), 'GET')).cases,
  addCases: async (promptId, cases) =>
    (await call(DeveloperEvalCaseListSchema, promptPath(promptId, 'cases'), 'POST', { cases }))
      .cases,
  updateCase: async (promptId, caseId, input) =>
    (
      await call(
        CaseResponse,
        promptPath(promptId, `cases/${encodeURIComponent(caseId)}`),
        'PUT',
        input,
      )
    ).case,
  removeCase: (promptId, caseId) =>
    call(null, promptPath(promptId, `cases/${encodeURIComponent(caseId)}`), 'DELETE'),
  runs: async (promptId) =>
    (await call(DeveloperEvalRunListSchema, promptPath(promptId, 'runs'), 'GET')).runs,
  startRun: async (promptId, version, checkKind) =>
    (await call(RunResponse, promptPath(promptId, 'runs'), 'POST', { version, checkKind })).run,
  run: async (promptId, runId) =>
    (await call(RunResponse, promptPath(promptId, `runs/${encodeURIComponent(runId)}`), 'GET')).run,
  recordResult: async (promptId, runId, input) =>
    (
      await call(
        ResultResponse,
        promptPath(promptId, `runs/${encodeURIComponent(runId)}/results`),
        'POST',
        input,
      )
    ).result,
  grade: async (promptId, runId, resultId, grade) =>
    (
      await call(
        ResultResponse,
        promptPath(
          promptId,
          `runs/${encodeURIComponent(runId)}/results/${encodeURIComponent(resultId)}`,
        ),
        'PATCH',
        { grade },
      )
    ).result,
};

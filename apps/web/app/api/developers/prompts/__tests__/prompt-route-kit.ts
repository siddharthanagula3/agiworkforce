import { NextRequest, NextResponse } from 'next/server';
import { vi } from 'vitest';

import type {
  DeveloperEvalCase,
  DeveloperEvalResult,
  DeveloperEvalRun,
  DeveloperPrompt,
  DeveloperPromptVersion,
} from '@agiworkforce/cloud-contracts';

import type { UserScopedDb } from '@/lib/server/rls-db';

export const DEVELOPER = 'user_developer';
export const PROMPT_ID = '0190b000-0000-7000-8000-0000000000a1';
export const CASE_ID = '0190b000-0000-7000-8000-0000000000c1';
export const RUN_ID = '0190b000-0000-7000-8000-0000000000e1';
export const RESULT_ID = '0190b000-0000-7000-8000-0000000000f1';

export const VERSION_INPUT = {
  systemPrompt: 'Answer in one sentence.',
  template: 'Summarise {{topic}}.',
  model: 'auto',
  maxTokens: 256,
  temperature: null,
};

export const PROMPT_VERSION: DeveloperPromptVersion = {
  ...VERSION_INPUT,
  version: 1,
  note: null,
  createdAt: '2026-10-19T00:00:00.000Z',
};

export const PROMPT: DeveloperPrompt = {
  id: PROMPT_ID,
  name: 'Release summary',
  latest: PROMPT_VERSION,
  caseCount: 1,
  updatedAt: '2026-10-19T00:00:00.000Z',
};

export const EVAL_CASE: DeveloperEvalCase = {
  id: CASE_ID,
  position: 0,
  variables: { topic: 'the release' },
  expectedOutput: 'It shipped.',
};

export const RESULT_INPUT = {
  caseId: CASE_ID,
  renderedInput: 'Summarise the release.',
  output: 'It shipped.',
  error: null,
  latencyMs: 820,
  inputTokens: 12,
  outputTokens: 4,
};

export const EVAL_RESULT: DeveloperEvalResult = {
  ...RESULT_INPUT,
  id: RESULT_ID,
  passed: true,
  grade: null,
};

export const EVAL_RUN: DeveloperEvalRun = {
  id: RUN_ID,
  version: 1,
  checkKind: 'exact',
  caseCount: 1,
  createdAt: '2026-10-19T00:00:00.000Z',
  results: [EVAL_RESULT],
};

export function promptScope(): UserScopedDb {
  return {
    db: { query: vi.fn(async () => []) },
    userId: DEVELOPER,
    organizationId: null,
  } as unknown as UserScopedDb;
}

export function opened() {
  return { scope: promptScope() };
}

export function refused() {
  return { limited: NextResponse.json({ error: 'refused' }, { status: 403 }) };
}

export function promptRequest(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`https://agiworkforce.test${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });
}

export function promptContext(params: Record<string, string> = {}) {
  return { params: Promise.resolve({ promptId: PROMPT_ID, ...params }) };
}

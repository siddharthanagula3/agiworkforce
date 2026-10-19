import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEVELOPER,
  EVAL_RESULT,
  PROMPT_ID,
  RESULT_ID,
  RUN_ID,
  opened,
  promptContext,
  promptRequest,
  refused,
} from '@/app/api/developers/prompts/__tests__/prompt-route-kit';

type PromptRouteModule = typeof import('@/lib/developers/prompt-route');
type PromptServiceModule = typeof import('@/lib/services/developer-prompt-service');

const mocks = vi.hoisted(() => ({
  openRead: vi.fn(),
  openWrite: vi.fn(),
  gradeResult: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/developers/prompt-route', async (importOriginal) => ({
  ...(await importOriginal<PromptRouteModule>()),
  openPromptRead: mocks.openRead,
  openPromptWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/developer-prompt-service', async (importOriginal) => ({
  ...(await importOriginal<PromptServiceModule>()),
  gradeResult: mocks.gradeResult,
}));

const { PATCH } = await import('./route');

const PATH = `/api/developers/prompts/${PROMPT_ID}/runs/${RUN_ID}/results/${RESULT_ID}`;
const IDS = { runId: RUN_ID, resultId: RESULT_ID };

describe('PATCH /api/developers/prompts/[promptId]/runs/[runId]/results/[resultId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openWrite.mockResolvedValue(opened());
    mocks.gradeResult.mockResolvedValue({ ...EVAL_RESULT, grade: 4 });
  });

  it('grades the result through the CSRF-checked write path', async () => {
    const response = await PATCH(promptRequest(PATH, 'PATCH', { grade: 4 }), promptContext(IDS));

    expect(response.status).toBe(200);
    expect(mocks.gradeResult).toHaveBeenCalledWith(
      expect.anything(),
      DEVELOPER,
      RUN_ID,
      RESULT_ID,
      4,
    );
    expect(await response.json()).toEqual({ result: { ...EVAL_RESULT, grade: 4 } });
  });

  it('clears a grade with null', async () => {
    await PATCH(promptRequest(PATH, 'PATCH', { grade: null }), promptContext(IDS));
    expect(mocks.gradeResult).toHaveBeenCalledWith(
      expect.anything(),
      DEVELOPER,
      RUN_ID,
      RESULT_ID,
      null,
    );
  });

  it('refuses a grade outside one to five', async () => {
    const response = await PATCH(promptRequest(PATH, 'PATCH', { grade: 6 }), promptContext(IDS));
    expect(response.status).toBe(400);
    expect(mocks.gradeResult).not.toHaveBeenCalled();
  });

  it('returns the refusal when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await PATCH(promptRequest(PATH, 'PATCH', { grade: 4 }), promptContext(IDS));
    expect(response.status).toBe(403);
    expect(mocks.gradeResult).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEVELOPER,
  EVAL_RESULT,
  PROMPT_ID,
  RESULT_INPUT,
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
  recordResult: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/developers/prompt-route', async (importOriginal) => ({
  ...(await importOriginal<PromptRouteModule>()),
  openPromptRead: mocks.openRead,
  openPromptWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/developer-prompt-service', async (importOriginal) => ({
  ...(await importOriginal<PromptServiceModule>()),
  recordResult: mocks.recordResult,
}));

const { POST } = await import('./route');

const PATH = `/api/developers/prompts/${PROMPT_ID}/runs/${RUN_ID}/results`;

describe('POST /api/developers/prompts/[promptId]/runs/[runId]/results', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openWrite.mockResolvedValue(opened());
    mocks.recordResult.mockResolvedValue(EVAL_RESULT);
  });

  it('records one case result through the CSRF-checked write path', async () => {
    const response = await POST(
      promptRequest(PATH, 'POST', RESULT_INPUT),
      promptContext({ runId: RUN_ID }),
    );

    expect(response.status).toBe(201);
    expect(mocks.recordResult).toHaveBeenCalledWith(
      expect.anything(),
      DEVELOPER,
      PROMPT_ID,
      RUN_ID,
      RESULT_INPUT,
    );
    expect(await response.json()).toEqual({ result: EVAL_RESULT });
  });

  it('refuses a result that names no case', async () => {
    const response = await POST(
      promptRequest(PATH, 'POST', { ...RESULT_INPUT, caseId: 'nope' }),
      promptContext({ runId: RUN_ID }),
    );
    expect(response.status).toBe(400);
    expect(mocks.recordResult).not.toHaveBeenCalled();
  });

  it('returns the refusal when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await POST(
      promptRequest(PATH, 'POST', RESULT_INPUT),
      promptContext({ runId: RUN_ID }),
    );
    expect(response.status).toBe(403);
    expect(mocks.recordResult).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEVELOPER,
  EVAL_RUN,
  PROMPT_ID,
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
  readRun: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/developers/prompt-route', async (importOriginal) => ({
  ...(await importOriginal<PromptRouteModule>()),
  openPromptRead: mocks.openRead,
  openPromptWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/developer-prompt-service', async (importOriginal) => ({
  ...(await importOriginal<PromptServiceModule>()),
  readRun: mocks.readRun,
}));

const { GET } = await import('./route');

const PATH = `/api/developers/prompts/${PROMPT_ID}/runs/${RUN_ID}`;

describe('GET /api/developers/prompts/[promptId]/runs/[runId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openRead.mockResolvedValue(opened());
    mocks.readRun.mockResolvedValue(EVAL_RUN);
  });

  it('answers with the run and its results, uncached', async () => {
    const response = await GET(promptRequest(PATH), promptContext({ runId: RUN_ID }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.readRun).toHaveBeenCalledWith(expect.anything(), DEVELOPER, PROMPT_ID, RUN_ID);
    expect(await response.json()).toEqual({ run: EVAL_RUN });
  });

  it('answers 404 for a run id that is not an id', async () => {
    const response = await GET(promptRequest(PATH), promptContext({ runId: 'nope' }));
    expect(response.status).toBe(404);
    expect(mocks.openRead).not.toHaveBeenCalled();
  });

  it('returns the refusal when the read is limited', async () => {
    mocks.openRead.mockResolvedValue(refused());
    const response = await GET(promptRequest(PATH), promptContext({ runId: RUN_ID }));
    expect(response.status).toBe(403);
    expect(mocks.readRun).not.toHaveBeenCalled();
  });
});

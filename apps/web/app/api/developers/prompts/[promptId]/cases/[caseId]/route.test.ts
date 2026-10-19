import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CASE_ID,
  DEVELOPER,
  EVAL_CASE,
  PROMPT_ID,
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
  updateCase: vi.fn(),
  deleteCase: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/developers/prompt-route', async (importOriginal) => ({
  ...(await importOriginal<PromptRouteModule>()),
  openPromptRead: mocks.openRead,
  openPromptWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/developer-prompt-service', async (importOriginal) => ({
  ...(await importOriginal<PromptServiceModule>()),
  updateCase: mocks.updateCase,
  deleteCase: mocks.deleteCase,
}));

const { PUT, DELETE } = await import('./route');

const PATH = `/api/developers/prompts/${PROMPT_ID}/cases/${CASE_ID}`;
const CASE_INPUT = { variables: { topic: 'the launch' }, expectedOutput: null };

describe('/api/developers/prompts/[promptId]/cases/[caseId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openWrite.mockResolvedValue(opened());
    mocks.updateCase.mockResolvedValue({ ...EVAL_CASE, ...CASE_INPUT });
    mocks.deleteCase.mockResolvedValue(undefined);
  });

  it('PUT replaces the case through the CSRF-checked write path', async () => {
    const response = await PUT(
      promptRequest(PATH, 'PUT', CASE_INPUT),
      promptContext({ caseId: CASE_ID }),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateCase).toHaveBeenCalledWith(
      expect.anything(),
      DEVELOPER,
      PROMPT_ID,
      CASE_ID,
      CASE_INPUT,
    );
    expect(await response.json()).toEqual({ case: { ...EVAL_CASE, ...CASE_INPUT } });
  });

  it('PUT answers 404 for a case id that is not an id and touches nothing', async () => {
    const response = await PUT(
      promptRequest(PATH, 'PUT', CASE_INPUT),
      promptContext({ caseId: 'nope' }),
    );
    expect(response.status).toBe(404);
    expect(mocks.openWrite).not.toHaveBeenCalled();
  });

  it('DELETE removes the case through the CSRF-checked write path', async () => {
    const response = await DELETE(
      promptRequest(PATH, 'DELETE'),
      promptContext({ caseId: CASE_ID }),
    );
    expect(response.status).toBe(204);
    expect(mocks.deleteCase).toHaveBeenCalledWith(expect.anything(), DEVELOPER, PROMPT_ID, CASE_ID);
  });

  it('DELETE returns the refusal when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await DELETE(
      promptRequest(PATH, 'DELETE'),
      promptContext({ caseId: CASE_ID }),
    );
    expect(response.status).toBe(403);
    expect(mocks.deleteCase).not.toHaveBeenCalled();
  });
});

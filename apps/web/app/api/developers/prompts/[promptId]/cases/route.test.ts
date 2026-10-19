import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEVELOPER,
  EVAL_CASE,
  PROMPT,
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
  requirePrompt: vi.fn(),
  listCases: vi.fn(),
  addCases: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/developers/prompt-route', async (importOriginal) => ({
  ...(await importOriginal<PromptRouteModule>()),
  openPromptRead: mocks.openRead,
  openPromptWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/developer-prompt-service', async (importOriginal) => ({
  ...(await importOriginal<PromptServiceModule>()),
  requirePrompt: mocks.requirePrompt,
  listCases: mocks.listCases,
  addCases: mocks.addCases,
}));

const { GET, POST } = await import('./route');

const PATH = `/api/developers/prompts/${PROMPT_ID}/cases`;
const CASE_INPUT = { variables: { topic: 'the release' }, expectedOutput: 'It shipped.' };

describe('/api/developers/prompts/[promptId]/cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openRead.mockResolvedValue(opened());
    mocks.openWrite.mockResolvedValue(opened());
    mocks.requirePrompt.mockResolvedValue(PROMPT);
    mocks.listCases.mockResolvedValue([EVAL_CASE]);
    mocks.addCases.mockResolvedValue([EVAL_CASE]);
  });

  it('GET lists test cases only after confirming the caller owns the prompt', async () => {
    const response = await GET(promptRequest(PATH), promptContext());

    expect(response.status).toBe(200);
    expect(mocks.requirePrompt).toHaveBeenCalledWith(expect.anything(), DEVELOPER, PROMPT_ID);
    expect(mocks.listCases).toHaveBeenCalledWith(expect.anything(), DEVELOPER, PROMPT_ID);
    expect(await response.json()).toEqual({ cases: [EVAL_CASE] });
  });

  it('POST adds a batch of cases through the CSRF-checked write path', async () => {
    const response = await POST(
      promptRequest(PATH, 'POST', { cases: [CASE_INPUT] }),
      promptContext(),
    );

    expect(response.status).toBe(201);
    expect(mocks.addCases).toHaveBeenCalledWith(expect.anything(), DEVELOPER, PROMPT_ID, [
      CASE_INPUT,
    ]);
  });

  it('POST refuses an empty batch', async () => {
    const response = await POST(promptRequest(PATH, 'POST', { cases: [] }), promptContext());
    expect(response.status).toBe(400);
    expect(mocks.addCases).not.toHaveBeenCalled();
  });

  it('POST returns the refusal when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await POST(
      promptRequest(PATH, 'POST', { cases: [CASE_INPUT] }),
      promptContext(),
    );
    expect(response.status).toBe(403);
    expect(mocks.addCases).not.toHaveBeenCalled();
  });
});

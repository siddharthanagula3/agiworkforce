import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEVELOPER,
  EVAL_RUN,
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
  listRuns: vi.fn(),
  createRun: vi.fn(),
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
  listRuns: mocks.listRuns,
  createRun: mocks.createRun,
}));

const { GET, POST } = await import('./route');

const PATH = `/api/developers/prompts/${PROMPT_ID}/runs`;
const { results: _results, ...RUN_SUMMARY_BASE } = EVAL_RUN;
const RUN_SUMMARY = { ...RUN_SUMMARY_BASE, passed: 1, failed: 0, graded: 0, averageGrade: null };

describe('/api/developers/prompts/[promptId]/runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openRead.mockResolvedValue(opened());
    mocks.openWrite.mockResolvedValue(opened());
    mocks.requirePrompt.mockResolvedValue(PROMPT);
    mocks.listRuns.mockResolvedValue([RUN_SUMMARY]);
    mocks.createRun.mockResolvedValue(EVAL_RUN);
  });

  it('GET lists run summaries only after confirming the caller owns the prompt', async () => {
    const response = await GET(promptRequest(PATH), promptContext());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.requirePrompt).toHaveBeenCalledWith(expect.anything(), DEVELOPER, PROMPT_ID);
    expect(await response.json()).toEqual({ runs: [RUN_SUMMARY] });
  });

  it('POST starts a run of one version through the CSRF-checked write path', async () => {
    const body = { version: 1, checkKind: 'exact' };
    const response = await POST(promptRequest(PATH, 'POST', body), promptContext());

    expect(response.status).toBe(201);
    expect(mocks.createRun).toHaveBeenCalledWith(expect.anything(), DEVELOPER, PROMPT_ID, body);
    expect(await response.json()).toEqual({ run: EVAL_RUN });
  });

  it('POST refuses a check the workbench does not offer', async () => {
    const response = await POST(
      promptRequest(PATH, 'POST', { version: 1, checkKind: 'regex' }),
      promptContext(),
    );
    expect(response.status).toBe(400);
    expect(mocks.createRun).not.toHaveBeenCalled();
  });

  it('POST returns the refusal when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await POST(
      promptRequest(PATH, 'POST', { version: 1, checkKind: 'exact' }),
      promptContext(),
    );
    expect(response.status).toBe(403);
    expect(mocks.createRun).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEVELOPER,
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
  renamePrompt: vi.fn(),
  deletePrompt: vi.fn(),
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
  renamePrompt: mocks.renamePrompt,
  deletePrompt: mocks.deletePrompt,
}));

const { GET, PATCH, DELETE } = await import('./route');

const PATH = `/api/developers/prompts/${PROMPT_ID}`;

describe('/api/developers/prompts/[promptId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openRead.mockResolvedValue(opened());
    mocks.openWrite.mockResolvedValue(opened());
    mocks.requirePrompt.mockResolvedValue(PROMPT);
    mocks.renamePrompt.mockResolvedValue({ ...PROMPT, name: 'Renamed' });
    mocks.deletePrompt.mockResolvedValue(undefined);
  });

  it('GET answers with a prompt the caller owns, uncached', async () => {
    const response = await GET(promptRequest(PATH), promptContext());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.requirePrompt).toHaveBeenCalledWith(expect.anything(), DEVELOPER, PROMPT_ID);
    expect(await response.json()).toEqual({ prompt: PROMPT });
  });

  it('GET answers 404 for an id that is not a prompt id', async () => {
    const response = await GET(promptRequest(PATH), promptContext({ promptId: 'nope' }));
    expect(response.status).toBe(404);
    expect(mocks.openRead).not.toHaveBeenCalled();
  });

  it('PATCH renames the prompt through the CSRF-checked write path', async () => {
    const response = await PATCH(
      promptRequest(PATH, 'PATCH', { name: 'Renamed' }),
      promptContext(),
    );

    expect(response.status).toBe(200);
    expect(mocks.renamePrompt).toHaveBeenCalledWith(
      expect.anything(),
      DEVELOPER,
      PROMPT_ID,
      'Renamed',
    );
  });

  it('PATCH refuses an empty name', async () => {
    const response = await PATCH(promptRequest(PATH, 'PATCH', { name: '  ' }), promptContext());
    expect(response.status).toBe(400);
    expect(mocks.renamePrompt).not.toHaveBeenCalled();
  });

  it('DELETE removes the prompt and returns the refusal untouched when the write is not allowed', async () => {
    expect((await DELETE(promptRequest(PATH, 'DELETE'), promptContext())).status).toBe(204);
    expect(mocks.deletePrompt).toHaveBeenCalledWith(expect.anything(), DEVELOPER, PROMPT_ID);

    mocks.deletePrompt.mockClear();
    mocks.openWrite.mockResolvedValue(refused());
    expect((await DELETE(promptRequest(PATH, 'DELETE'), promptContext())).status).toBe(403);
    expect(mocks.deletePrompt).not.toHaveBeenCalled();
  });
});

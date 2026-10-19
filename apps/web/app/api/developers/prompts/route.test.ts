import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEVELOPER,
  PROMPT,
  VERSION_INPUT,
  opened,
  promptRequest,
  refused,
} from '@/app/api/developers/prompts/__tests__/prompt-route-kit';

type PromptRouteModule = typeof import('@/lib/developers/prompt-route');
type PromptServiceModule = typeof import('@/lib/services/developer-prompt-service');

const mocks = vi.hoisted(() => ({
  openRead: vi.fn(),
  openWrite: vi.fn(),
  listPrompts: vi.fn(),
  createPrompt: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/developers/prompt-route', async (importOriginal) => ({
  ...(await importOriginal<PromptRouteModule>()),
  openPromptRead: mocks.openRead,
  openPromptWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/developer-prompt-service', async (importOriginal) => ({
  ...(await importOriginal<PromptServiceModule>()),
  listPrompts: mocks.listPrompts,
  createPrompt: mocks.createPrompt,
}));

const { GET, POST } = await import('./route');

const PATH = '/api/developers/prompts';

describe('/api/developers/prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openRead.mockResolvedValue(opened());
    mocks.openWrite.mockResolvedValue(opened());
    mocks.listPrompts.mockResolvedValue([PROMPT]);
    mocks.createPrompt.mockResolvedValue(PROMPT);
  });

  it("GET lists the caller's prompts, uncached", async () => {
    const response = await GET(promptRequest(PATH));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.listPrompts).toHaveBeenCalledWith(expect.anything(), DEVELOPER);
    expect(await response.json()).toEqual({ prompts: [PROMPT] });
  });

  it('GET returns the refusal when the read is limited', async () => {
    mocks.openRead.mockResolvedValue(refused());
    expect((await GET(promptRequest(PATH))).status).toBe(403);
    expect(mocks.listPrompts).not.toHaveBeenCalled();
  });

  it('POST creates a prompt with its first version through the CSRF-checked write path', async () => {
    const body = { name: 'Release summary', version: VERSION_INPUT };
    const response = await POST(promptRequest(PATH, 'POST', body));

    expect(response.status).toBe(201);
    expect(mocks.openRead).not.toHaveBeenCalled();
    expect(mocks.createPrompt).toHaveBeenCalledWith(expect.anything(), DEVELOPER, body);
    expect(await response.json()).toEqual({ prompt: PROMPT });
  });

  it('POST refuses a prompt with no template', async () => {
    const response = await POST(
      promptRequest(PATH, 'POST', { name: 'x', version: { ...VERSION_INPUT, template: '' } }),
    );
    expect(response.status).toBe(400);
    expect(mocks.createPrompt).not.toHaveBeenCalled();
  });
});

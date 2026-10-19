import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEVELOPER,
  PROMPT,
  PROMPT_ID,
  PROMPT_VERSION,
  VERSION_INPUT,
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
  listVersions: vi.fn(),
  saveVersion: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/developers/prompt-route', async (importOriginal) => ({
  ...(await importOriginal<PromptRouteModule>()),
  openPromptRead: mocks.openRead,
  openPromptWrite: mocks.openWrite,
}));
vi.mock('@/lib/services/developer-prompt-service', async (importOriginal) => ({
  ...(await importOriginal<PromptServiceModule>()),
  listVersions: mocks.listVersions,
  saveVersion: mocks.saveVersion,
}));

const { GET, POST } = await import('./route');

const PATH = `/api/developers/prompts/${PROMPT_ID}/versions`;

describe('/api/developers/prompts/[promptId]/versions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openRead.mockResolvedValue(opened());
    mocks.openWrite.mockResolvedValue(opened());
    mocks.listVersions.mockResolvedValue([PROMPT_VERSION]);
    mocks.saveVersion.mockResolvedValue(PROMPT);
  });

  it('GET lists the versions of the prompt, uncached', async () => {
    const response = await GET(promptRequest(PATH), promptContext());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.listVersions).toHaveBeenCalledWith(expect.anything(), DEVELOPER, PROMPT_ID);
    expect(await response.json()).toEqual({ versions: [PROMPT_VERSION] });
  });

  it('POST saves a new version through the CSRF-checked write path', async () => {
    const body = { ...VERSION_INPUT, note: 'Shorter' };
    const response = await POST(promptRequest(PATH, 'POST', body), promptContext());

    expect(response.status).toBe(201);
    expect(mocks.openRead).not.toHaveBeenCalled();
    expect(mocks.saveVersion).toHaveBeenCalledWith(expect.anything(), DEVELOPER, PROMPT_ID, body);
  });

  it('POST refuses a temperature outside the range a model accepts', async () => {
    const response = await POST(
      promptRequest(PATH, 'POST', { ...VERSION_INPUT, temperature: 3 }),
      promptContext(),
    );
    expect(response.status).toBe(400);
    expect(mocks.saveVersion).not.toHaveBeenCalled();
  });

  it('POST returns the refusal when the write is not allowed', async () => {
    mocks.openWrite.mockResolvedValue(refused());
    const response = await POST(promptRequest(PATH, 'POST', VERSION_INPUT), promptContext());
    expect(response.status).toBe(403);
    expect(mocks.saveVersion).not.toHaveBeenCalled();
  });
});

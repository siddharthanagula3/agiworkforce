import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOwnSkills, isSkillName } from '../src/features/cloud-bridge/skillsClient';

describe('account skills for the composer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists only the skills the account owns, like the web Skills menu', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            skills: [
              { name: 'ab-testing', description: 'Bundled', source: 'bundled' },
              { name: 'release-notes', description: 'Mine', source: 'user' },
              { name: 'bad/name', description: 'Path', source: 'user' },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOwnSkills('token')).resolves.toEqual([
      { name: 'release-notes', description: 'Mine' },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/skills$/);
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer token');
  });

  it('says the list could not load instead of showing an empty menu', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    );
    await expect(fetchOwnSkills('token')).rejects.toThrow(/could not be loaded/);
  });

  it('accepts the names the server accepts', () => {
    expect(isSkillName('release-notes')).toBe(true);
    expect(isSkillName(' padded')).toBe(false);
    expect(isSkillName('a\\b')).toBe(false);
    expect(isSkillName('x'.repeat(201))).toBe(false);
  });
});

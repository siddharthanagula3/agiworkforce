// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { csrfMock, rateLimitMock, userScopedDbMock, storeOwnedPluginSourceMock } = vi.hoisted(
  () => ({
    csrfMock: vi.fn(),
    rateLimitMock: vi.fn(),
    userScopedDbMock: vi.fn(),
    storeOwnedPluginSourceMock: vi.fn(),
  }),
);

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: csrfMock }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: rateLimitMock }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: userScopedDbMock }));
vi.mock('@/lib/services/plugin-owned-source-service', () => ({
  storeOwnedPluginSource: storeOwnedPluginSourceMock,
}));

import { NextRequest, NextResponse } from 'next/server';
import { parseSkillFile } from '@/features/plugins/server/directory/skill-files';
import { POST } from '../route';

const USER_ID = 'user-1';
const AUTHORED_URL = 'http://localhost/api/plugins/authored';
const DB = { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() };

const INSTALLATION = {
  id: 'installation-1',
  entryId: 'entry-1',
  sourceId: 'source-1',
  pluginKey: 'release-notes',
  installedVersion: '0.0.0',
  enabled: true,
  enabledSkills: ['draft-release-notes'],
  customExamplePrompts: null,
  installedAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
};

function draft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Release notes',
    description: 'Turns a changelog into release notes',
    skills: [
      {
        name: 'draft-release-notes',
        description: 'Draft release notes from a changelog',
        body: 'Read the changelog and write the notes.',
      },
    ],
    ...overrides,
  };
}

function authoredRequest(body: unknown): NextRequest {
  return new NextRequest(AUTHORED_URL, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  csrfMock.mockResolvedValue(null);
  rateLimitMock.mockResolvedValue(null);
  userScopedDbMock.mockResolvedValue({ db: DB, userId: USER_ID, organizationId: null });
  storeOwnedPluginSourceMock.mockResolvedValue([
    {
      entryId: 'entry-1',
      pluginKey: 'release-notes',
      name: 'Release notes',
      skills: ['draft-release-notes'],
      installation: INSTALLATION,
    },
  ]);
});

describe('POST /api/plugins/authored', () => {
  it('refuses a request that fails the csrf gate before touching the database', async () => {
    csrfMock.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await POST(authoredRequest(draft()));
    expect(response.status).toBe(403);
    expect(userScopedDbMock).not.toHaveBeenCalled();
    expect(storeOwnedPluginSourceMock).not.toHaveBeenCalled();
  });

  it('returns the rate limiter response and writes nothing', async () => {
    rateLimitMock.mockResolvedValue(NextResponse.json({ error: 'slow down' }, { status: 429 }));
    const response = await POST(authoredRequest(draft()));
    expect(response.status).toBe(429);
    expect(storeOwnedPluginSourceMock).not.toHaveBeenCalled();
  });

  it('rate limits on the same bucket the sibling install routes use', async () => {
    await POST(authoredRequest(draft()));
    expect(rateLimitMock).toHaveBeenCalledWith(
      expect.anything(),
      'plugin-installation-write',
      `user:${USER_ID}`,
    );
  });

  it.each([
    ['no name', draft({ name: '' })],
    ['no description', draft({ description: '' })],
    ['no skills', draft({ skills: [] })],
    ['an unknown field', { ...draft(), colour: 'blue' }],
    ['a skill with no body', draft({ skills: [{ name: 'a', description: 'a', body: '' }] })],
  ])('refuses a draft with %s', async (_label, body) => {
    const response = await POST(authoredRequest(body));
    expect(response.status).toBe(400);
    expect(storeOwnedPluginSourceMock).not.toHaveBeenCalled();
  });

  it('refuses a name that cannot become a plugin identifier', async () => {
    const response = await POST(authoredRequest(draft({ name: '!!!' })));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining('cannot be used as a plugin identifier') },
    });
    expect(storeOwnedPluginSourceMock).not.toHaveBeenCalled();
  });

  it('refuses a skill name the slash menu could not address', async () => {
    const response = await POST(
      authoredRequest(draft({ skills: [{ name: 'Not A Slug', description: 'a', body: 'b' }] })),
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining('lowercase letters, numbers and hyphens') },
    });
    expect(storeOwnedPluginSourceMock).not.toHaveBeenCalled();
  });

  it('refuses two skills claiming the same name', async () => {
    const response = await POST(
      authoredRequest(
        draft({
          skills: [
            { name: 'same', description: 'first', body: 'one' },
            { name: 'same', description: 'second', body: 'two' },
          ],
        }),
      ),
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Each skill in a plugin needs its own name.' },
    });
    expect(storeOwnedPluginSourceMock).not.toHaveBeenCalled();
  });

  it('refuses a description longer than the entries table accepts', async () => {
    const response = await POST(authoredRequest(draft({ description: 'x'.repeat(2_001) })));
    expect(response.status).toBe(422);
    expect(storeOwnedPluginSourceMock).not.toHaveBeenCalled();
  });

  it('stores the draft as an authored plugin against the caller scoped handle', async () => {
    const response = await POST(authoredRequest(draft()));
    expect(response.status).toBe(201);
    expect(storeOwnedPluginSourceMock).toHaveBeenCalledWith(DB, USER_ID, {
      kind: 'authored',
      sourceName: 'Release notes',
      plugins: [
        {
          key: 'release-notes',
          name: 'Release notes',
          description: 'Turns a changelog into release notes',
          version: '0.0.0',
          skills: [
            {
              name: 'draft-release-notes',
              path: 'skills/draft-release-notes/SKILL.md',
              content: expect.stringContaining('name: draft-release-notes'),
            },
          ],
        },
      ],
    });
  });

  it('writes a SKILL.md the read path can parse back', async () => {
    await POST(authoredRequest(draft()));
    const stored = storeOwnedPluginSourceMock.mock.calls[0]![2] as {
      plugins: Array<{ skills: Array<{ path: string; content: string }> }>;
    };
    const file = stored.plugins[0]!.skills[0]!;
    expect(parseSkillFile(file.path, file.content)).toEqual({
      name: 'draft-release-notes',
      description: 'Draft release notes from a changelog',
      body: 'Read the changelog and write the notes.',
      path: 'skills/draft-release-notes/SKILL.md',
    });
  });

  it('reports the marketplace schema as unavailable rather than a server error', async () => {
    storeOwnedPluginSourceMock.mockRejectedValue(
      Object.assign(new Error('missing'), { code: '42P01' }),
    );
    const response = await POST(authoredRequest(draft()));
    expect(response.status).toBe(503);
  });
});

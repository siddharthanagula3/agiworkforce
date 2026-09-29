import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  find: vi.fn(),
  readManaged: vi.fn(),
  listEnabled: vi.fn(),
  allowsPlugins: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/services/skill-catalog-service', () => ({
  findSelectableSkillWithFiles: mocks.find,
  readManagedSkillFileBytes: mocks.readManaged,
}));
vi.mock('@/lib/services/plugin-installation-service', () => ({
  listEnabledPluginIds: mocks.listEnabled,
}));
vi.mock('@/lib/services/workspace-plugin-access', () => ({
  workspaceAllowsPlugins: mocks.allowsPlugins,
}));

import { createError } from '@/lib/errors';
import { GET } from '../route';

const DB = { query: vi.fn() };
const SKILL = { name: 'pdf' };

function call(path: string[], query = '', name = 'pdf') {
  return GET(
    new NextRequest(`http://localhost/api/skills/${name}/files/${path.join('/')}${query}`) as never,
    { params: Promise.resolve({ name, path }) },
  );
}

describe('GET /api/skills/[name]/files/[...path]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db: DB, userId: 'user-1' });
    mocks.allowsPlugins.mockResolvedValue(true);
    mocks.listEnabled.mockResolvedValue(new Set(['plugin-a']));
    mocks.find.mockResolvedValue({
      skill: SKILL,
      managed: false,
      access: { readFile: mocks.readFile },
    });
  });

  it('returns 401 when the caller is not signed in', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await call(['README.md']);
    expect(response.status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('rejects an empty path and an overlong name', async () => {
    expect((await call([])).status).toBe(400);
    expect((await call(['a.md'], '', 'x'.repeat(201))).status).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('returns 404 when the skill is not selectable for the caller', async () => {
    mocks.find.mockResolvedValue(null);
    const response = await call(['README.md']);
    expect(response.status).toBe(404);
  });

  it('does not load plugins when the workspace forbids them', async () => {
    mocks.allowsPlugins.mockResolvedValue(false);
    mocks.find.mockImplementation(
      async (input: { loadEnabledPluginIds: () => Promise<Set<string>> }) => {
        expect(await input.loadEnabledPluginIds()).toEqual(new Set());
        return null;
      },
    );
    await call(['README.md']);
    expect(mocks.find).toHaveBeenCalledWith(
      expect.objectContaining({ db: DB, userId: 'user-1', name: 'pdf', pluginsAllowed: false }),
    );
    expect(mocks.listEnabled).not.toHaveBeenCalled();
  });

  it('maps binary, too large and missing reads to 415, 413 and 404', async () => {
    mocks.readFile.mockResolvedValueOnce({ ok: false, reason: 'binary' });
    expect((await call(['img.png'])).status).toBe(415);
    mocks.readFile.mockResolvedValueOnce({ ok: false, reason: 'too_large' });
    expect((await call(['big.txt'])).status).toBe(413);
    mocks.readFile.mockResolvedValueOnce({ ok: false, reason: 'missing' });
    expect((await call(['nope.txt'])).status).toBe(404);
  });

  it('returns the text file preview', async () => {
    mocks.readFile.mockResolvedValue({ ok: true, path: 'docs/guide.md', content: 'hello' });
    const response = await call(['docs', 'guide.md']);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      file: { path: 'docs/guide.md', size: 5, content: 'hello' },
    });
    expect(mocks.readFile).toHaveBeenCalledWith(SKILL, 'docs/guide.md');
  });

  it('downloads a text file as an attachment', async () => {
    mocks.readFile.mockResolvedValue({ ok: true, path: 'docs/guide.md', content: 'hello' });
    const response = await call(['docs', 'guide.md'], '?download=1');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toContain('filename="guide.md"');
    await expect(response.text()).resolves.toBe('hello');
  });

  it('downloads managed skill bytes and refuses oversize ones', async () => {
    mocks.find.mockResolvedValue({
      skill: SKILL,
      managed: true,
      access: { readFile: mocks.readFile },
    });
    mocks.readManaged.mockResolvedValueOnce({
      ok: true,
      file: { path: 'bin/tool', bytes: new Uint8Array([1, 2, 3]), contentHash: 'h1' },
    });
    const ok = await call(['bin', 'tool'], '?download=1');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('etag')).toBe('"h1"');
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(mocks.readManaged).toHaveBeenCalledWith(SKILL, 'bin/tool');

    mocks.readManaged.mockResolvedValueOnce({ ok: false, reason: 'too_large' });
    expect((await call(['bin', 'tool'], '?download=1')).status).toBe(413);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  requireCsrfToken: vi.fn(),
  getClerkAuthUser: vi.fn(),
  listEnabledPluginIds: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mocks.getClerkAuthUser }));
vi.mock('@/lib/services/plugin-installation-service', () => ({
  listEnabledPluginIds: mocks.listEnabledPluginIds,
}));
vi.mock('@/features/plugins/server/directory/installed-skills', () => ({
  listInstalledDirectorySkills: vi.fn(async () => []),
}));

interface FakeDb {
  query: () => Promise<Array<{ settings: Record<string, unknown> }>>;
  execute: (sql: string, params?: unknown[]) => Promise<number>;
  transaction: <T>(fn: (tx: FakeDb) => Promise<T>) => Promise<T>;
}

function fakeDb(initialSettings: Record<string, unknown> = {}): FakeDb {
  let stored: Record<string, unknown> | null =
    Object.keys(initialSettings).length > 0 ? initialSettings : null;
  const query = vi.fn(async () => (stored ? [{ settings: stored }] : []));
  const execute = vi.fn(async (_sql: string, params?: unknown[]) => {
    stored = JSON.parse(params?.[1] as string) as Record<string, unknown>;
    return 1;
  });
  const db: FakeDb = {
    query,
    execute,
    transaction: async <T>(fn: (tx: FakeDb) => Promise<T>) => fn(db),
  };
  return db;
}

const sharedDb = fakeDb();

vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => sharedDb }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: async () => ({ db: sharedDb, userId: 'user-1' }),
}));

import { GET as listInstalls, POST as installSkill } from '../route';
import { DELETE as uninstallSkill } from '../[name]/route';
import { GET as listSkills } from '@/app/api/skills/route';
import { resetManagedSkillCatalogCacheForTests } from '@/lib/services/skill-catalog-service';

function getRequest(): NextRequest {
  return new NextRequest('http://localhost/api/skills/installs');
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/skills/installs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function deleteRequest(name: string): NextRequest {
  return new NextRequest(`http://localhost/api/skills/installs/${name}`, { method: 'DELETE' });
}

describe('/api/skills/installs', () => {
  let root: string | null = null;

  beforeEach(async () => {
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user-1' });
    mocks.listEnabledPluginIds.mockResolvedValue(new Set(['research-pack']));
    root = await mkdtemp(join(tmpdir(), 'agi-skill-installs-'));
    await mkdir(join(root, 'design-review'), { recursive: true });
    await writeFile(
      join(root, 'design-review', 'SKILL.md'),
      '---\nname: design-review\ndescription: Review UI for release polish.\n---\nBody',
      'utf-8',
    );
    await mkdir(join(root, 'literature-review'), { recursive: true });
    await writeFile(
      join(root, 'literature-review', 'SKILL.md'),
      '---\nname: literature-review\ndescription: Survey sources.\nplugin: research-pack\n---\nBody',
      'utf-8',
    );
    process.env['SKILLS_LAYERS'] = JSON.stringify([{ rootDir: root, source: 'personal' }]);
    resetManagedSkillCatalogCacheForTests();
    Object.assign(sharedDb, fakeDb());
  });

  afterEach(async () => {
    delete process.env['SKILLS_LAYERS'];
    resetManagedSkillCatalogCacheForTests();
    if (root) await rm(root, { recursive: true, force: true });
    root = null;
  });

  it('GET reports a never-toggled skill as installed by default', async () => {
    const res = await listInstalls(getRequest());
    const body = (await res.json()) as { installed: string[] };
    expect(res.status).toBe(200);
    expect(body.installed).toContain('design-review');
  });

  it('POST installs a skill and the resolved list reflects it', async () => {
    await uninstallSkill(deleteRequest('design-review'), {
      params: Promise.resolve({ name: 'design-review' }),
    });
    const installRes = await installSkill(postRequest({ name: 'design-review' }));
    const body = (await installRes.json()) as { installed: string[] };
    expect(installRes.status).toBe(200);
    expect(body.installed).toContain('design-review');
  });

  it('DELETE uninstalls a skill and hides it from the resolved list', async () => {
    const res = await uninstallSkill(deleteRequest('design-review'), {
      params: Promise.resolve({ name: 'design-review' }),
    });
    const body = (await res.json()) as { installed: string[] };
    expect(res.status).toBe(200);
    expect(body.installed).not.toContain('design-review');
  });

  it('POST rejects a plugin-owned skill name', async () => {
    const res = await installSkill(postRequest({ name: 'literature-review' }));
    expect(res.status).toBe(409);
  });

  it('DELETE rejects a plugin-owned skill name', async () => {
    const res = await uninstallSkill(deleteRequest('literature-review'), {
      params: Promise.resolve({ name: 'literature-review' }),
    });
    expect(res.status).toBe(409);
  });

  it('POST returns 404 for a name that is not a managed skill', async () => {
    const res = await installSkill(postRequest({ name: 'does-not-exist' }));
    expect(res.status).toBe(404);
  });

  it('POST checks CSRF before touching the database', async () => {
    mocks.requireCsrfToken.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const res = await installSkill(postRequest({ name: 'design-review' }));
    expect(res.status).toBe(403);
  });

  it('hides an uninstalled skill from the composer picker listing', async () => {
    await uninstallSkill(deleteRequest('design-review'), {
      params: Promise.resolve({ name: 'design-review' }),
    });
    const res = await listSkills(new NextRequest('http://localhost/api/skills'));
    const body = (await res.json()) as { skills: Array<{ name: string }> };
    expect(body.skills.map((entry) => entry.name)).not.toContain('design-review');
  });

  it('keeps a skill visible in the composer picker after it is reinstalled', async () => {
    await uninstallSkill(deleteRequest('design-review'), {
      params: Promise.resolve({ name: 'design-review' }),
    });
    await installSkill(postRequest({ name: 'design-review' }));
    const res = await listSkills(new NextRequest('http://localhost/api/skills'));
    const body = (await res.json()) as { skills: Array<{ name: string }> };
    expect(body.skills.map((entry) => entry.name)).toContain('design-review');
  });
});

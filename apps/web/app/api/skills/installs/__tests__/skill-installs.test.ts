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
  recordWorkspaceAuditEvent: vi.fn(),
  buildWorkspaceFeatureGateResponse: vi.fn(),
  listPermittedPluginIds: vi.fn(),
  workspaceAllowsPlugins: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mocks.getClerkAuthUser }));
vi.mock('@/lib/workspace-audit', () => ({
  recordWorkspaceAuditEvent: mocks.recordWorkspaceAuditEvent,
}));
vi.mock('@/lib/services/plugin-installation-service', () => ({
  listEnabledPluginIds: mocks.listEnabledPluginIds,
}));
vi.mock('@/features/plugins/server/directory/installed-skills', () => ({
  findInstalledDirectorySkillWithFiles: vi.fn(async () => null),
  listInstalledDirectorySkills: vi.fn(async () => []),
}));

vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/managed-compute-gate')>()),
  buildWorkspaceFeatureGateResponse: mocks.buildWorkspaceFeatureGateResponse,
}));
vi.mock('@/lib/services/workspace-plugin-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/workspace-plugin-access')>()),
  listPermittedPluginIds: mocks.listPermittedPluginIds,
  workspaceAllowsPlugins: mocks.workspaceAllowsPlugins,
}));

function fakeDb(initialSettings: Record<string, unknown> | null = null, commitError?: Error) {
  let stored = initialSettings;
  const events: string[] = [];
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('user_settings')) {
      expect(sql).toContain('where user_id = $1 limit 1');
      return stored ? [{ settings: stored }] : [];
    }
    return [];
  });
  const txQuery = vi.fn(async (sql: string, params: unknown[]) => {
    expect(params[0]).toBe('user-1');
    if (sql.startsWith('select ')) {
      expect(sql).toBe('select settings from public.user_settings where user_id = $1 for update');
      events.push('lock');
      return stored ? [{ settings: stored }] : [];
    }
    if (sql.trimStart().startsWith('insert ')) {
      expect(sql).toContain('insert into public.user_settings');
      expect(sql).toContain('on conflict (user_id) do nothing');
      events.push('insert');
    } else {
      expect(sql).toContain('update public.user_settings');
      expect(sql).toContain('set settings = $2::jsonb');
      expect(sql).toContain('where user_id = $1');
      events.push('update');
    }
    expect(sql).toContain('returning settings');
    stored = JSON.parse(String(params[1])) as Record<string, unknown>;
    return [{ settings: stored }];
  });
  const execute = vi.fn(async () => {
    throw new Error('Unexpected settings execute');
  });
  const transaction = vi.fn(
    async <T>(fn: (tx: { query: typeof txQuery; execute: typeof execute }) => Promise<T>) => {
      const before = stored;
      events.push('begin');
      let result: T;
      try {
        result = await fn({ query: txQuery, execute });
      } catch (error) {
        stored = before;
        events.push('rollback');
        throw error;
      }
      if (commitError) {
        events.push('commit-uncertain');
        throw commitError;
      }
      events.push('commit');
      return result;
    },
  );
  return { query, execute, transaction, txQuery, events };
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
    vi.clearAllMocks();
    mocks.buildWorkspaceFeatureGateResponse.mockResolvedValue(null);
    mocks.workspaceAllowsPlugins.mockResolvedValue(true);
    mocks.listPermittedPluginIds.mockResolvedValue(new Set(['research-pack']));
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
    await mkdir(join(root, 'unreleased-fixture'), { recursive: true });
    await writeFile(
      join(root, 'unreleased-fixture', 'SKILL.md'),
      '---\nname: unreleased-fixture\ndescription: Not shipped yet.\ndraft: true\n---\nBody',
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
    const uninstallRes = await uninstallSkill(deleteRequest('design-review'), {
      params: Promise.resolve({ name: 'design-review' }),
    });
    expect(uninstallRes.status).toBe(200);
    expect((await uninstallRes.json()).installed).not.toContain('design-review');
    const installRes = await installSkill(postRequest({ name: 'design-review' }));
    const body = (await installRes.json()) as { installed: string[] };
    expect(installRes.status).toBe(200);
    expect(body.installed).toContain('design-review');
    expect(mocks.recordWorkspaceAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'skill_installed',
        detail: expect.objectContaining({ resourceId: 'design-review' }),
      }),
    );
  });

  it('DELETE uninstalls a skill and hides it from the resolved list', async () => {
    const res = await uninstallSkill(deleteRequest('design-review'), {
      params: Promise.resolve({ name: 'design-review' }),
    });
    const body = (await res.json()) as { installed: string[] };
    expect(res.status).toBe(200);
    expect(body.installed).not.toContain('design-review');
    expect(mocks.recordWorkspaceAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        eventType: 'skill_uninstalled',
        detail: expect.objectContaining({ resourceId: 'design-review' }),
      }),
    );
  });

  it('POST rejects a plugin-owned skill name', async () => {
    mocks.recordWorkspaceAuditEvent.mockClear();
    const res = await installSkill(postRequest({ name: 'literature-review' }));
    expect(res.status).toBe(409);
    expect(mocks.recordWorkspaceAuditEvent).not.toHaveBeenCalled();
  });

  it('DELETE rejects a plugin-owned skill name', async () => {
    const res = await uninstallSkill(deleteRequest('literature-review'), {
      params: Promise.resolve({ name: 'literature-review' }),
    });
    expect(res.status).toBe(409);
  });

  it('never reports a draft skill as installed, because it can never be executed', async () => {
    const res = await listInstalls(getRequest());
    const body = (await res.json()) as { installed: string[] };
    expect(body.installed).not.toContain('unreleased-fixture');
  });

  it('POST refuses a draft skill instead of storing an override that changes nothing', async () => {
    const res = await installSkill(postRequest({ name: 'unreleased-fixture' }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: { message?: string } };
    expect(body.error?.message).toContain('not available yet');
  });

  it('DELETE refuses a draft skill', async () => {
    const res = await uninstallSkill(deleteRequest('unreleased-fixture'), {
      params: Promise.resolve({ name: 'unreleased-fixture' }),
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
    const uninstallRes = await uninstallSkill(deleteRequest('design-review'), {
      params: Promise.resolve({ name: 'design-review' }),
    });
    expect(uninstallRes.status).toBe(200);
    const res = await listSkills(new NextRequest('http://localhost/api/skills'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skills: Array<{ name: string }> };
    expect(body.skills.map((entry) => entry.name)).not.toContain('design-review');
  });

  it('keeps a skill visible in the composer picker after it is reinstalled', async () => {
    const uninstallRes = await uninstallSkill(deleteRequest('design-review'), {
      params: Promise.resolve({ name: 'design-review' }),
    });
    expect(uninstallRes.status).toBe(200);
    expect((await uninstallRes.json()).installed).not.toContain('design-review');
    const installRes = await installSkill(postRequest({ name: 'design-review' }));
    expect(installRes.status).toBe(200);
    const res = await listSkills(new NextRequest('http://localhost/api/skills'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skills: Array<{ name: string }> };
    expect(body.skills.map((entry) => entry.name)).toContain('design-review');
  });

  it('respects the workspace feature denial before starting a settings transaction', async () => {
    mocks.buildWorkspaceFeatureGateResponse.mockResolvedValueOnce(
      new Response(null, { status: 403 }),
    );
    const response = await installSkill(postRequest({ name: 'design-review' }));
    expect(response.status).toBe(403);
    expect(sharedDb.transaction).not.toHaveBeenCalled();
    expect(mocks.recordWorkspaceAuditEvent).not.toHaveBeenCalled();
  });

  it.each(['POST', 'DELETE'])(
    '%s exposes exact-size validation without audit or success',
    async (method) => {
      Object.assign(sharedDb, fakeDb({ profile: { text: 'x'.repeat(100_000) } }));
      const response =
        method === 'POST'
          ? await installSkill(postRequest({ name: 'design-review' }))
          : await uninstallSkill(deleteRequest('design-review'), {
              params: Promise.resolve({ name: 'design-review' }),
            });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: 'VALIDATION_ERROR', message: 'Settings payload is too large' },
      });
      expect(sharedDb.events).toEqual(['begin', 'lock', 'rollback']);
      expect(sharedDb.query).not.toHaveBeenCalled();
      expect(mocks.recordWorkspaceAuditEvent).not.toHaveBeenCalled();
      expect(sharedDb.transaction).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['POST', 'DELETE'])(
    '%s does not audit or return success after uncertain commit failure',
    async (method) => {
      Object.assign(sharedDb, fakeDb({}, new Error('Commit acknowledgment lost')));
      const response =
        method === 'POST'
          ? await installSkill(postRequest({ name: 'design-review' }))
          : await uninstallSkill(deleteRequest('design-review'), {
              params: Promise.resolve({ name: 'design-review' }),
            });
      expect(response.status).toBe(500);
      expect(await response.json()).not.toHaveProperty('installed');
      expect(sharedDb.events).toEqual(['begin', 'lock', 'update', 'commit-uncertain']);
      expect(sharedDb.query).not.toHaveBeenCalled();
      expect(mocks.recordWorkspaceAuditEvent).not.toHaveBeenCalled();
      expect(sharedDb.transaction).toHaveBeenCalledTimes(1);
    },
  );

  it('audits only after the settings transaction has committed', async () => {
    mocks.recordWorkspaceAuditEvent.mockImplementationOnce(async () => {
      expect(sharedDb.events).toEqual(['begin', 'lock', 'insert', 'commit']);
    });
    const response = await installSkill(postRequest({ name: 'design-review' }));
    expect(response.status).toBe(200);
    expect(mocks.recordWorkspaceAuditEvent).toHaveBeenCalledTimes(1);
  });
});

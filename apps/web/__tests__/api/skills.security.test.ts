import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/error-handler', () => ({
  withErrorHandler:
    (handler: (req: NextRequest, context?: unknown) => Promise<Response>) =>
    (req: NextRequest, context?: unknown) =>
      handler(req, context),
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn().mockResolvedValue({ userId: 'user_test' }),
}));

vi.mock('@/lib/services/plugin-installation-service', () => ({
  listEnabledPluginIds: vi.fn().mockResolvedValue(new Set(['research-pack'])),
  listEnabledPluginIdsForUser: vi.fn().mockResolvedValue(new Set(['research-pack'])),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({})),
}));

import { GET as listSkills } from '@/app/api/skills/route';
import { GET as getSkillBody } from '@/app/api/skills/[name]/route';
import { GET as downloadSkill } from '@/app/api/skills/[name]/download/route';
import { resetManagedSkillCatalogCacheForTests } from '@/lib/services/skill-catalog-service';

function request(path: string, origin?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'GET',
    ...(origin ? { headers: { origin } } : {}),
  });
}

describe('skills API security contract', () => {
  let tempSkillsRoot: string | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { getClerkAuthUser } = await import('@/lib/api-auth');
    vi.mocked(getClerkAuthUser).mockResolvedValue({ userId: 'user_test' } as never);
    const { listEnabledPluginIds, listEnabledPluginIdsForUser } =
      await import('@/lib/services/plugin-installation-service');
    vi.mocked(listEnabledPluginIds).mockResolvedValue(new Set(['research-pack']));
    vi.mocked(listEnabledPluginIdsForUser).mockResolvedValue(new Set(['research-pack']));
    tempSkillsRoot = await mkdtemp(join(tmpdir(), 'agi-skills-api-'));
    const skillDir = join(tempSkillsRoot, 'design-review');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: design-review',
        'description: Review UI for release polish.',
        '---',
        '',
        'Use AGI product rules and cite concrete UI defects.',
      ].join('\n'),
      'utf-8',
    );
    process.env['SKILLS_LAYERS'] = JSON.stringify([
      { rootDir: tempSkillsRoot, source: 'personal' },
    ]);
    resetManagedSkillCatalogCacheForTests();
  });

  afterEach(async () => {
    delete process.env['SKILLS_LAYERS'];
    resetManagedSkillCatalogCacheForTests();
    if (tempSkillsRoot) {
      await rm(tempSkillsRoot, { recursive: true, force: true });
      tempSkillsRoot = null;
    }
  });

  it('returns metadata without host file paths or bodies', async () => {
    const response = await listSkills(request('/api/skills', 'https://tauri.localhost'));
    const body = await response.text();
    const json = JSON.parse(body) as {
      skills: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://tauri.localhost');
    expect(json.skills).toContainEqual({
      name: 'design-review',
      description: 'Review UI for release polish.',
      source: 'personal',
      lifecycle: 'included',
      downloadable: false,
    });
    expect(body).not.toContain('/Users/');
    expect(body).not.toContain('SKILL.md');
    expect(body).not.toContain('Use AGI product rules');
  });

  it('requires auth before listing skills', async () => {
    const { getClerkAuthUser } = await import('@/lib/api-auth');
    vi.mocked(getClerkAuthUser).mockRejectedValueOnce(new Error('Unauthorized'));

    await expect(listSkills(request('/api/skills'))).rejects.toThrow('Unauthorized');
  });

  it('requires auth before returning a skill body', async () => {
    const { getClerkAuthUser } = await import('@/lib/api-auth');
    vi.mocked(getClerkAuthUser).mockRejectedValueOnce(new Error('Unauthorized'));

    await expect(
      getSkillBody(request('/api/skills/design-review'), {
        params: Promise.resolve({ name: 'design-review' }),
      }),
    ).rejects.toThrow('Unauthorized');
  });

  it('downloads only an included bundled SKILL.md with attachment headers', async () => {
    const response = await downloadSkill(request('/api/skills/code-review/download'), {
      params: Promise.resolve({ name: 'code-review' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="SKILL.md"');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toContain('name: code-review');
  });

  it('offers and downloads an enabled plugin-owned bundled skill', async () => {
    const listResponse = await listSkills(request('/api/skills'));
    const listBody = (await listResponse.json()) as {
      skills: Array<{ name: string; downloadable: boolean }>;
    };
    expect(listBody.skills).toContainEqual(
      expect.objectContaining({ name: 'literature-review', downloadable: true }),
    );

    const response = await downloadSkill(request('/api/skills/literature-review/download'), {
      params: Promise.resolve({ name: 'literature-review' }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('name: literature-review');
  });

  it('requires auth before downloading a bundled skill', async () => {
    const { getClerkAuthUser } = await import('@/lib/api-auth');
    vi.mocked(getClerkAuthUser).mockRejectedValueOnce(new Error('Unauthorized'));

    await expect(
      downloadSkill(request('/api/skills/code-review/download'), {
        params: Promise.resolve({ name: 'code-review' }),
      }),
    ).rejects.toThrow('Unauthorized');
  });
});

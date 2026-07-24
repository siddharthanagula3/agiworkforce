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

import { GET as listSkills } from '@/app/api/skills/route';
import { GET as getSkillBody } from '@/app/api/skills/[name]/route';

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
  });

  afterEach(async () => {
    delete process.env['SKILLS_LAYERS'];
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
    expect(json.skills).toHaveLength(1);
    expect(json.skills[0]).toEqual({
      name: 'design-review',
      description: 'Review UI for release polish.',
      source: 'personal',
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
});

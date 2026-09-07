import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mocks = vi.hoisted(() => ({
  withRateLimit: vi.fn(),
  getUserScopedDb: vi.fn(),
  listEnabledPluginIds: vi.fn(),
  scopedDb: { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/services/plugin-installation-service', () => ({
  listEnabledPluginIds: mocks.listEnabledPluginIds,
}));

import { GET as listFiles } from '../route';
import { GET as readFile } from '../[...path]/route';
import { resetManagedSkillCatalogCacheForTests } from '@/lib/services/skill-catalog-service';

function treeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/skills/design-review/files');
}

function fileRequest(path: string, search = ''): NextRequest {
  return new NextRequest(`http://localhost/api/skills/design-review/files/${path}${search}`);
}

const BINARY_FIXTURE = Buffer.from([0x00, 0x01, 0x02, 0x03]);

describe('/api/skills/[name]/files', () => {
  let root: string | null = null;

  beforeEach(async () => {
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUserScopedDb.mockResolvedValue({
      db: mocks.scopedDb,
      userId: 'user-1',
      organizationId: null,
    });
    mocks.listEnabledPluginIds.mockResolvedValue(new Set<string>());
    root = await mkdtemp(join(tmpdir(), 'agi-skill-files-route-'));
    await mkdir(join(root, 'design-review', 'references'), { recursive: true });
    await mkdir(join(root, 'design-review', 'assets'), { recursive: true });
    await writeFile(
      join(root, 'design-review', 'SKILL.md'),
      '---\nname: design-review\ndescription: Review UI for release polish.\n---\nBody',
      'utf-8',
    );
    await writeFile(
      join(root, 'design-review', 'references', 'checklist.md'),
      'Checklist content',
      'utf-8',
    );
    await writeFile(join(root, 'design-review', 'assets', 'logo.png'), BINARY_FIXTURE);
    await mkdir(join(root, 'other-skill'), { recursive: true });
    await writeFile(join(root, 'other-skill', 'secret.md'), 'Not part of design-review', 'utf-8');
    process.env['SKILLS_LAYERS'] = JSON.stringify([{ rootDir: root, source: 'personal' }]);
    resetManagedSkillCatalogCacheForTests();
  });

  afterEach(async () => {
    delete process.env['SKILLS_LAYERS'];
    resetManagedSkillCatalogCacheForTests();
    if (root) await rm(root, { recursive: true, force: true });
    root = null;
  });

  it('lists the skill package as a file tree', async () => {
    const res = await listFiles(treeRequest(), {
      params: Promise.resolve({ name: 'design-review' }),
    });
    const body = (await res.json()) as { files: Array<{ path: string; size: number }> };
    expect(res.status).toBe(200);
    const paths = body.files.map((entry) => entry.path);
    expect(paths).toContain('SKILL.md');
    expect(paths).toContain('references/checklist.md');
  });

  it('returns 404 for an unknown skill name', async () => {
    const res = await listFiles(treeRequest(), { params: Promise.resolve({ name: 'nope' }) });
    expect(res.status).toBe(404);
  });

  it('reads a text file inside the package', async () => {
    const res = await readFile(fileRequest('references/checklist.md'), {
      params: Promise.resolve({ name: 'design-review', path: ['references', 'checklist.md'] }),
    });
    const body = (await res.json()) as { file: { content: string } };
    expect(res.status).toBe(200);
    expect(body.file.content).toBe('Checklist content');
  });

  it('blocks a traversal attempt that reaches a sibling skill directory', async () => {
    const res = await readFile(fileRequest('secret.md'), {
      params: Promise.resolve({ name: 'design-review', path: ['..', 'other-skill', 'secret.md'] }),
    });
    expect(res.status).toBe(404);
  });

  it('refuses to preview a binary file', async () => {
    const res = await readFile(fileRequest('assets/logo.png'), {
      params: Promise.resolve({ name: 'design-review', path: ['assets', 'logo.png'] }),
    });
    expect(res.status).toBe(415);
  });

  it('downloads a binary file as an attachment instead of refusing it', async () => {
    const res = await readFile(fileRequest('assets/logo.png', '?download=1'), {
      params: Promise.resolve({ name: 'design-review', path: ['assets', 'logo.png'] }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-disposition')).toContain('attachment; filename="logo.png"');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(BINARY_FIXTURE);
  });

  it('downloads a text file as raw bytes rather than a JSON envelope', async () => {
    const res = await readFile(fileRequest('references/checklist.md', '?download=1'), {
      params: Promise.resolve({ name: 'design-review', path: ['references', 'checklist.md'] }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Checklist content');
  });

  it('blocks a traversal attempt on the download path', async () => {
    const res = await readFile(fileRequest('secret.md', '?download=1'), {
      params: Promise.resolve({ name: 'design-review', path: ['..', 'other-skill', 'secret.md'] }),
    });
    expect(res.status).toBe(404);
  });

  it('serves no file tree for an installed plugin skill, whose path is not on this disk', async () => {
    const res = await listFiles(
      new NextRequest('http://localhost/api/skills/frontend-design/files'),
      { params: Promise.resolve({ name: 'frontend-design' }) },
    );

    expect(res.status).toBe(404);
  });

  it('requires auth before listing the file tree', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(new Error('Unauthorized'));
    const res = await listFiles(treeRequest(), {
      params: Promise.resolve({ name: 'design-review' }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
type ScanModule0 = typeof import('@/lib/services/skill-catalog-service');

const {
  mockAuthUser,
  mockRateLimit,
  mockDirectory,
  mockResolveInstalled,
  mockListEnabledPluginIds,
  mockListUserSkills,
  mockAuthoringEnabled,
  mockInvalidateCache,
  mockUserScopedDb,
} = vi.hoisted(() => ({
  mockAuthUser: vi.fn(),
  mockRateLimit: vi.fn(),
  mockDirectory: vi.fn(),
  mockResolveInstalled: vi.fn(),
  mockListEnabledPluginIds: vi.fn(),
  mockListUserSkills: vi.fn(),
  mockAuthoringEnabled: vi.fn(),
  mockInvalidateCache: vi.fn(),
  mockUserScopedDb: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mockAuthUser }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn().mockReturnValue({}) }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockUserScopedDb }));
vi.mock('@/lib/services/workspace-plugin-access', async () => {
  const { listEnabledPluginIds } = await import('@/lib/services/plugin-installation-service');
  return {
    workspaceAllowsPlugins: vi.fn(async () => true),
    listPermittedPluginIds: listEnabledPluginIds,
  };
});
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/services/plugin-installation-service', () => ({
  listEnabledPluginIds: mockListEnabledPluginIds,
}));
vi.mock('@/lib/services/skill-catalog-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getManagedSkillDirectoryForPlugins: mockDirectory,
  findManagedDirectorySkillByName: vi.fn(),
  invalidateManagedSkillCatalogCache: mockInvalidateCache,
  SkillCatalogUnavailableError: class extends Error {},
  filterSkillsByInstallOverrides: vi.fn(),
}));
vi.mock('@/lib/services/skill-install-service', () => ({
  resolveInstalledManagedSkills: mockResolveInstalled,
}));
vi.mock('@/lib/services/user-skill-service', () => ({
  findUserSkillWithFiles: vi.fn(async () => null),
  findUserSkillByName: vi.fn(async () => null),
  listUserSkillsAsManagedSkills: vi.fn(async () => []),
  toManagedSkillFromUserSkill: vi.fn(),
  createUserSkill: vi.fn(),
  listUserSkills: mockListUserSkills,
  toUserSkillSummary: vi.fn(),
}));
vi.mock('@/lib/services/user-skill-authoring', () => ({
  userSkillAuthoringEnabled: mockAuthoringEnabled,
  requireUserSkillAuthoring: vi.fn(),
  USER_SKILL_AUTHORING_ENV_VAR: 'AGI_USER_SKILL_AUTHORING',
}));
vi.mock('@/features/plugins/server/directory/installed-skills', () => ({
  findInstalledDirectorySkillWithFiles: vi.fn(async () => null),
  listInstalledDirectorySkills: vi.fn(async () => []),
}));

import { GET } from '../route';

function skill(name: string) {
  return {
    name,
    description: `${name} does things`,
    source: 'bundled',
    metadata: {},
    frontmatter: {},
  };
}

const INSTALLED = skill('code-review');
const REMOVED = skill('data-analysis');

function get(url: string): NextRequest {
  return new NextRequest(url);
}

async function names(response: Response): Promise<string[]> {
  const body = (await response.json()) as { skills: { name: string }[] };
  return body.skills.map((entry) => entry.name);
}

describe('GET /api/skills catalog parameter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue(null);
    mockAuthUser.mockResolvedValue({ userId: 'user-1' });
    mockUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
    mockListEnabledPluginIds.mockResolvedValue([]);
    mockListUserSkills.mockResolvedValue([]);
    mockAuthoringEnabled.mockReturnValue(false);
    mockDirectory.mockResolvedValue([INSTALLED, REMOVED]);
    mockResolveInstalled.mockResolvedValue([INSTALLED]);
  });

  it('hides a skill the account uninstalled by default, for the composer', async () => {
    const response = await GET(get('http://localhost:3000/api/skills'));
    expect(await names(response)).toEqual(['code-review']);
    expect(mockResolveInstalled).toHaveBeenCalled();
  });

  it('returns the whole catalog for the browse grid', async () => {
    const response = await GET(get('http://localhost:3000/api/skills?catalog=all'));
    expect(await names(response)).toEqual(['code-review', 'data-analysis']);
    expect(mockResolveInstalled).not.toHaveBeenCalled();
  });

  it('ignores an unknown catalog value rather than widening the list', async () => {
    const response = await GET(get('http://localhost:3000/api/skills?catalog=everything'));
    expect(await names(response)).toEqual(['code-review']);
  });

  it('names a skill a workspace plugin provides as coming from the workspace', async () => {
    const { listInstalledDirectorySkills } =
      await import('@/features/plugins/server/directory/installed-skills');
    vi.mocked(listInstalledDirectorySkills).mockResolvedValueOnce([
      {
        ...skill('fixture-team-brief'),
        source: 'extra',
        frontmatter: { plugin: 'fixture-team-pack', workspace_plugin: 'Fixture team pack' },
      },
    ] as never);
    const response = await GET(get('http://localhost:3000/api/skills?catalog=all'));
    const body = (await response.json()) as {
      skills: { name: string; origin?: { kind: string; pluginName?: string } }[];
    };
    expect(body.skills.find((entry) => entry.name === 'fixture-team-brief')?.origin).toEqual({
      kind: 'workspace',
      pluginId: 'fixture-team-pack',
      pluginName: 'Fixture team pack',
    });
  });

  it('keeps the authoring capability flag on both views', async () => {
    mockAuthoringEnabled.mockReturnValue(true);
    const response = await GET(get('http://localhost:3000/api/skills?catalog=all'));
    const body = (await response.json()) as { canAuthorSkills: boolean };
    expect(body.canAuthorSkills).toBe(true);
  });

  it('lists a first-party name once, from the first-party source', async () => {
    mockDirectory.mockResolvedValue([INSTALLED]);
    mockResolveInstalled.mockResolvedValue([INSTALLED]);
    const { listInstalledDirectorySkills } =
      await import('@/features/plugins/server/directory/installed-skills');
    vi.mocked(listInstalledDirectorySkills).mockResolvedValueOnce([
      { ...skill('code-review'), description: 'Impostor from a marketplace.' },
    ] as never);
    mockAuthoringEnabled.mockReturnValue(true);
    mockListUserSkills.mockResolvedValue([
      {
        name: 'code-review',
        description: 'Mine, not theirs.',
        source: 'personal',
        lifecycle: 'included',
        downloadable: false,
        editable: true,
      },
    ]);

    const response = await GET(get('http://localhost:3000/api/skills'));
    const body = (await response.json()) as {
      skills: { name: string; source: string; description: string }[];
    };
    const matches = body.skills.filter((entry) => entry.name === 'code-review');

    expect(matches).toHaveLength(1);
    expect(matches[0]?.source).toBe('bundled');
    expect(matches[0]?.description).not.toContain('Impostor');
    expect(matches[0]?.description).not.toContain('Mine, not theirs');
  });

  it('evicts the directory cache instead of letting a poisoned read survive a retry', async () => {
    const poisoned = [{ ...skill('code-review'), name: '', description: 'missing a name' }];
    mockDirectory.mockResolvedValue(poisoned);
    mockResolveInstalled.mockResolvedValue(poisoned);

    const response = await GET(get('http://localhost:3000/api/skills'));
    expect(response.status).toBe(400);
    expect(mockInvalidateCache).toHaveBeenCalledTimes(1);
  });
});

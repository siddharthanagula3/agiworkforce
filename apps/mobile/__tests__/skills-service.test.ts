import { ApiHttpError, api } from '@/services/api';
import {
  fetchInstalledSkillNames,
  fetchManagedSkills,
  fetchSkillCatalog,
  installSkill,
  isPluginOwnedSkill,
  isSkillInstalled,
  parseManagedSkillsResponse,
  skillActionFailureMessage,
  uninstallSkill,
} from '@/src/features/skills/service';

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { skills: true } }));
jest.mock('@/services/api', () => {
  class ApiHttpError extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return {
    api: {
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
    },
    ApiHttpError,
  };
});

const apiMock = api as jest.Mocked<typeof api>;

describe('mobile Skills service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads and validates the authenticated Managed Cloud catalog', async () => {
    apiMock.get.mockResolvedValueOnce({
      skills: [
        {
          name: '  Documents  ',
          description: '  Create and edit documents.  ',
          source: 'bundled',
          lifecycle: 'included',
          downloadable: true,
        },
        {
          name: 'Team release',
          description: 'Prepare the release handoff.',
          source: 'workspace',
          lifecycle: 'draft',
          downloadable: false,
        },
      ],
    });
    const controller = new AbortController();

    await expect(fetchManagedSkills(controller.signal)).resolves.toEqual([
      {
        name: 'Documents',
        description: 'Create and edit documents.',
        source: 'bundled',
        lifecycle: 'included',
        downloadable: true,
      },
      {
        name: 'Team release',
        description: 'Prepare the release handoff.',
        source: 'workspace',
        lifecycle: 'draft',
        downloadable: false,
      },
    ]);
    expect(apiMock.get).toHaveBeenCalledWith('/api/skills', {
      signal: controller.signal,
    });
  });

  it('carries the new optional requiredTools field through unchanged', async () => {
    apiMock.get.mockResolvedValueOnce({
      skills: [
        {
          name: 'document-creation',
          description: 'Create documents.',
          source: 'bundled',
          lifecycle: 'included',
          downloadable: true,
          requiredTools: ['create_office_file'],
        },
      ],
    });

    await expect(fetchManagedSkills()).resolves.toEqual([
      {
        name: 'document-creation',
        description: 'Create documents.',
        source: 'bundled',
        lifecycle: 'included',
        downloadable: true,
        requiredTools: ['create_office_file'],
      },
    ]);
  });

  it('still parses a payload from a deployment that does not report requirements', () => {
    expect(
      parseManagedSkillsResponse({
        skills: [
          {
            name: 'code-review',
            description: 'Review a diff.',
            source: 'bundled',
            lifecycle: 'included',
            downloadable: true,
          },
        ],
      })[0],
    ).not.toHaveProperty('requiredTools');
  });

  it.each([
    null,
    {},
    { skills: null },
    {
      skills: [
        {
          name: '',
          description: 'Empty name',
          source: 'bundled',
          lifecycle: 'included',
          downloadable: false,
        },
      ],
    },
    {
      skills: [
        {
          name: 'Unknown',
          description: 'Bad source',
          source: 'marketplace',
          lifecycle: 'included',
          downloadable: false,
        },
      ],
    },
    {
      skills: [
        {
          name: 'Missing description',
          source: 'bundled',
          lifecycle: 'included',
          downloadable: false,
        },
      ],
    },
    {
      skills: [
        {
          name: 'Missing lifecycle',
          description: '',
          source: 'bundled',
          downloadable: false,
        },
      ],
    },
    {
      skills: [
        {
          name: 'Draft download',
          description: '',
          source: 'bundled',
          lifecycle: 'draft',
          downloadable: true,
        },
      ],
    },
  ])('rejects malformed server payload %# instead of rendering drifted data', (payload) => {
    expect(() => parseManagedSkillsResponse(payload)).toThrow(
      'Skills returned an invalid response.',
    );
  });

  it('reads the whole catalog and the account installs the way web does', async () => {
    apiMock.get.mockResolvedValueOnce({ skills: [] });
    apiMock.get.mockResolvedValueOnce({ installed: ['Documents'] });
    const controller = new AbortController();

    await expect(fetchSkillCatalog(controller.signal)).resolves.toEqual([]);
    await expect(fetchInstalledSkillNames(controller.signal)).resolves.toEqual(
      new Set(['Documents']),
    );
    expect(apiMock.get).toHaveBeenNthCalledWith(1, '/api/skills?catalog=all', {
      signal: controller.signal,
    });
    expect(apiMock.get).toHaveBeenNthCalledWith(2, '/api/skills/installs', {
      signal: controller.signal,
    });
  });

  it('installs by name and uninstalls by the encoded name', async () => {
    apiMock.post.mockResolvedValueOnce({ installed: ['release notes'] });
    apiMock.delete.mockResolvedValueOnce({ installed: [] });

    await expect(installSkill('release notes')).resolves.toEqual(new Set(['release notes']));
    await expect(uninstallSkill('release notes')).resolves.toEqual(new Set());
    expect(apiMock.post).toHaveBeenCalledWith('/api/skills/installs', { name: 'release notes' });
    expect(apiMock.delete).toHaveBeenCalledWith('/api/skills/installs/release%20notes');
  });

  it('rejects an installs payload that is not a list of names', async () => {
    apiMock.get.mockResolvedValueOnce({ installed: [1] });

    await expect(fetchInstalledSkillNames()).rejects.toThrow(
      'Skills returned an invalid response.',
    );
  });

  it('counts a draft as never installed and an authored Skill as always installed', () => {
    const base = { description: '', downloadable: false } as const;

    expect(
      isSkillInstalled(
        { ...base, name: 'a', source: 'bundled', lifecycle: 'draft' },
        new Set(['a']),
      ),
    ).toBe(false);
    expect(
      isSkillInstalled(
        { ...base, name: 'b', source: 'personal', lifecycle: 'included' },
        new Set(),
      ),
    ).toBe(true);
    expect(
      isPluginOwnedSkill({
        ...base,
        name: 'c',
        source: 'bundled',
        lifecycle: 'included',
        origin: { kind: 'catalog', pluginId: 'office' },
      }),
    ).toBe(true);
  });

  it('passes a server refusal through and hides everything else behind the web copy', () => {
    expect(
      skillActionFailureMessage(new ApiHttpError('"x" is not available yet.', 409), true),
    ).toBe('"x" is not available yet.');
    expect(skillActionFailureMessage(new ApiHttpError('boom', 500), true)).toBe(
      'Could not install this skill. Try again.',
    );
    expect(skillActionFailureMessage(new Error('Network request failed'), false)).toBe(
      'Could not remove this skill. Try again.',
    );
  });
});

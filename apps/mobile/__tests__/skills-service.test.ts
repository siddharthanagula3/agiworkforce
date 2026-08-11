import { api } from '@/services/api';
import { fetchManagedSkills, parseManagedSkillsResponse } from '@/src/features/skills/service';

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { skills: true } }));
jest.mock('@/services/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

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
});

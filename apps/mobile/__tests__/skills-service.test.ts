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
        },
        {
          name: 'Team release',
          description: 'Prepare the release handoff.',
          source: 'workspace',
        },
      ],
    });
    const controller = new AbortController();

    await expect(fetchManagedSkills(controller.signal)).resolves.toEqual([
      {
        name: 'Documents',
        description: 'Create and edit documents.',
        source: 'bundled',
      },
      {
        name: 'Team release',
        description: 'Prepare the release handoff.',
        source: 'workspace',
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
    { skills: [{ name: '', description: 'Empty name', source: 'bundled' }] },
    { skills: [{ name: 'Unknown', description: 'Bad source', source: 'marketplace' }] },
    { skills: [{ name: 'Missing description', source: 'bundled' }] },
  ])('rejects malformed server payload %# instead of rendering drifted data', (payload) => {
    expect(() => parseManagedSkillsResponse(payload)).toThrow(
      'Skills returned an invalid response.',
    );
  });
});

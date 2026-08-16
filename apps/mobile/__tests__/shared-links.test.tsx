import { fetchSharedLinks, revokeSharedLink } from '@/src/features/shared-links/service';

const mockGet = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

const row = (overrides: Record<string, unknown> = {}) => ({
  token: 'tok-1',
  title: 'Planning session',
  shareUrl: 'https://agiworkforce.com/share/tok-1',
  modelId: 'model-a',
  provider: 'anthropic',
  messageCount: 3,
  createdAt: '2026-07-01T00:00:00.000Z',
  expiresAt: '2026-08-01T00:00:00.000Z',
  expired: false,
  ...overrides,
});

describe('shared links service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists the account own shares from the real endpoint', async () => {
    mockGet.mockResolvedValue({ shares: [row()] });

    const links = await fetchSharedLinks();

    expect(mockGet).toHaveBeenCalledWith('/api/share');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ token: 'tok-1', title: 'Planning session', expired: false });
  });

  it('drops rows that cannot be opened or revoked', async () => {
    mockGet.mockResolvedValue({ shares: [row(), { title: 'broken' }, row({ token: '' })] });

    const links = await fetchSharedLinks();
    expect(links).toHaveLength(1);
  });

  it('returns an empty list when the response has no shares array', async () => {
    mockGet.mockResolvedValue({});
    await expect(fetchSharedLinks()).resolves.toEqual([]);
  });

  it('preserves the server expiry verdict rather than recomputing it', async () => {
    mockGet.mockResolvedValue({ shares: [row({ expired: true })] });
    const links = await fetchSharedLinks();
    expect(links[0]?.expired).toBe(true);
  });

  it('encodes the token when revoking', async () => {
    mockDelete.mockResolvedValue(undefined);
    await revokeSharedLink('a/b c');
    expect(mockDelete).toHaveBeenCalledWith('/api/share/a%2Fb%20c');
  });
});

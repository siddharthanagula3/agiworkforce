import { fetchSharedLinks, revokeSharedLink, type SharedLinksRequestOptions } from '@/src/features/shared-links/service';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  captureCloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

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
  let options: SharedLinksRequestOptions;
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCloudAccountSessionForTests();
    activateCloudAccount('fixture-account');
    const accountEpoch = captureCloudAccountEpoch();
    if (!accountEpoch) throw new Error('Missing fixture account');
    options = { accountEpoch };
  });

  it('lists the account own shares from the real endpoint', async () => {
    mockGet.mockResolvedValue({ shares: [row()] });

    const links = await fetchSharedLinks(options);

    expect(mockGet).toHaveBeenCalledWith('/api/share', options);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ token: 'tok-1', title: 'Planning session', expired: false });
  });

  it('drops rows that cannot be opened or revoked', async () => {
    mockGet.mockResolvedValue({ shares: [row(), { title: 'broken' }, row({ token: '' })] });

    const links = await fetchSharedLinks(options);
    expect(links).toHaveLength(1);
  });

  it('returns an empty list when the response has no shares array', async () => {
    mockGet.mockResolvedValue({});
    await expect(fetchSharedLinks(options)).resolves.toEqual([]);
  });

  it('preserves the server expiry verdict rather than recomputing it', async () => {
    mockGet.mockResolvedValue({ shares: [row({ expired: true })] });
    const links = await fetchSharedLinks(options);
    expect(links[0]?.expired).toBe(true);
  });

  it('encodes the token when revoking', async () => {
    mockDelete.mockResolvedValue(undefined);
    await revokeSharedLink('a/b c', options);
    expect(mockDelete).toHaveBeenCalledWith('/api/share/a%2Fb%20c', options);
  });

  it('treats revoking a link that is already gone as done', async () => {
    const { ApiHttpError } =
      jest.requireActual<typeof import('@/services/apiErrors')>('@/services/apiErrors');
    mockDelete.mockRejectedValueOnce(new ApiHttpError('Share not found', 404));

    await expect(revokeSharedLink('gone', options)).resolves.toBeUndefined();
  });

  it('refuses a stale original account before listing or revoking', async () => {
    activateCloudAccount('replacement-account');
    await expect(fetchSharedLinks(options)).rejects.toMatchObject({ name: 'StaleCloudAccountOperationError' });
    await expect(revokeSharedLink('old', options)).rejects.toMatchObject({ name: 'StaleCloudAccountOperationError' });
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('does not accept a late 404 after the original account retires', async () => {
    const { ApiHttpError } =
      jest.requireActual<typeof import('@/services/apiErrors')>('@/services/apiErrors');
    let reject!: (error: Error) => void;
    mockDelete.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    const pending = revokeSharedLink('old', options);
    const settled = pending.catch((error: unknown) => error);
    activateCloudAccount('replacement-account');
    reject(new ApiHttpError('Share not found', 404));
    expect(await settled).toMatchObject({ name: 'StaleCloudAccountOperationError' });
  });
});

import { useTermsAcceptanceStore } from '../src/features/auth/store/termsAcceptanceStore';
import { ApiHttpError, CloudCredentialUnavailableError } from '../services/apiErrors';

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

describe('native Terms acceptance', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    useTermsAcceptanceStore.getState().reset();
  });

  it('keeps Cloud locked until the current server version is recorded for the account', async () => {
    mockGet.mockResolvedValue({ currentVersion: 'current-policy', accepted: false });
    mockPost.mockResolvedValue({ version: 'current-policy', acceptedAt: '2026-09-26T00:00:00Z' });

    await useTermsAcceptanceStore.getState().verify('person-a');
    expect(useTermsAcceptanceStore.getState()).toMatchObject({
      userId: 'person-a',
      status: 'required',
      currentVersion: 'current-policy',
    });
    expect(mockPost).not.toHaveBeenCalled();

    await useTermsAcceptanceStore.getState().accept('person-a');
    expect(mockPost).toHaveBeenCalledWith('/api/terms/accept', {
      surface: 'mobile-auth',
      version: 'current-policy',
    });
    expect(useTermsAcceptanceStore.getState().status).toBe('accepted');
  });

  it('does not apply an earlier account check to the current account', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    mockGet
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ currentVersion: 'current-policy', accepted: false });

    const first = useTermsAcceptanceStore.getState().verify('person-a');
    await useTermsAcceptanceStore.getState().verify('person-b');
    resolveFirst({ currentVersion: 'current-policy', accepted: true });
    await first;

    expect(useTermsAcceptanceStore.getState()).toMatchObject({
      userId: 'person-b',
      status: 'required',
    });
  });

  it('requires a fresh policy check when recording acceptance fails', async () => {
    mockGet.mockResolvedValue({ currentVersion: 'current-policy', accepted: false });
    mockPost.mockRejectedValue(new Error('offline'));

    await useTermsAcceptanceStore.getState().verify('person-a');
    await useTermsAcceptanceStore.getState().accept('person-a');

    expect(useTermsAcceptanceStore.getState()).toMatchObject({
      status: 'error',
      currentVersion: null,
    });
  });

  it('does not unlock Cloud for a malformed acceptance response', async () => {
    mockGet.mockResolvedValue({ currentVersion: 'current-policy', accepted: 'yes' });

    await useTermsAcceptanceStore.getState().verify('person-a');

    expect(useTermsAcceptanceStore.getState().status).toBe('error');
  });

  it('does not unlock Cloud when the acceptance write lacks a valid recorded time', async () => {
    mockGet.mockResolvedValue({ currentVersion: 'current-policy', accepted: false });
    mockPost.mockResolvedValue({ version: 'current-policy', acceptedAt: 'not-a-date' });

    await useTermsAcceptanceStore.getState().verify('person-a');
    await useTermsAcceptanceStore.getState().accept('person-a');

    expect(useTermsAcceptanceStore.getState()).toMatchObject({
      status: 'error',
      currentVersion: null,
    });
  });

  it('explains when the live service has not received the Terms status endpoint', async () => {
    mockGet.mockRejectedValue(new ApiHttpError('Request failed (HTTP 405)', 405));

    await useTermsAcceptanceStore.getState().verify('person-a');

    expect(useTermsAcceptanceStore.getState()).toMatchObject({
      status: 'error',
      error: expect.stringContaining('service update'),
    });
  });

  it('does not mistake a missing bound mobile credential for a service outage', async () => {
    mockGet.mockRejectedValue(new CloudCredentialUnavailableError());

    await useTermsAcceptanceStore.getState().verify('person-a');

    expect(useTermsAcceptanceStore.getState()).toMatchObject({
      status: 'error',
      error: expect.stringContaining('device session'),
    });
  });
});

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

  it('says a passkey is needed when Advanced Account Security stops the check', async () => {
    mockGet.mockRejectedValue(new ApiHttpError('Verify with a passkey.', 403, 'PASSKEY_REQUIRED'));

    await useTermsAcceptanceStore.getState().verify('person-a');

    expect(useTermsAcceptanceStore.getState()).toMatchObject({ status: 'error' });
    expect(useTermsAcceptanceStore.getState().error).toContain('passkeys');
  });

  it('does not mistake a missing bound mobile credential for a service outage', async () => {
    mockGet.mockRejectedValue(new CloudCredentialUnavailableError());

    await useTermsAcceptanceStore.getState().verify('person-a');

    expect(useTermsAcceptanceStore.getState()).toMatchObject({
      status: 'error',
      error: expect.stringContaining('device session'),
    });
  });

  it('rechecks an accepted account without dropping it while the answer is pending', async () => {
    mockGet.mockResolvedValueOnce({ currentVersion: 'v1', accepted: true });
    await useTermsAcceptanceStore.getState().verify('person-a');

    let resolveCheck: (value: unknown) => void = () => undefined;
    mockGet.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );
    const pending = useTermsAcceptanceStore.getState().recheck('person-a');
    expect(useTermsAcceptanceStore.getState().status).toBe('accepted');

    resolveCheck({ currentVersion: 'v2', accepted: false });
    await pending;
    expect(useTermsAcceptanceStore.getState()).toMatchObject({
      status: 'required',
      currentVersion: 'v2',
    });
  });

  it('keeps an accepted account when the recheck cannot reach the server', async () => {
    mockGet.mockResolvedValueOnce({ currentVersion: 'v1', accepted: true });
    await useTermsAcceptanceStore.getState().verify('person-a');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockGet.mockRejectedValueOnce(new Error('offline'));

    await useTermsAcceptanceStore.getState().recheck('person-a');

    expect(useTermsAcceptanceStore.getState().status).toBe('accepted');
    warn.mockRestore();
  });

  it('re-prompts with the newer version when the Terms changed mid-review', async () => {
    mockGet.mockResolvedValueOnce({ currentVersion: 'v1', accepted: false });
    await useTermsAcceptanceStore.getState().verify('person-a');
    mockPost.mockRejectedValueOnce(
      new ApiHttpError(
        'The Terms of Service changed after this page loaded.',
        409,
        'TERMS_VERSION_OUTDATED',
        {
          body: { currentVersion: 'v2' },
        },
      ),
    );

    await useTermsAcceptanceStore.getState().accept('person-a');

    expect(useTermsAcceptanceStore.getState()).toMatchObject({
      status: 'required',
      currentVersion: 'v2',
      error: 'The Terms changed. Review the current version before continuing.',
    });
  });
});

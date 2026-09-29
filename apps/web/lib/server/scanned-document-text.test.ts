import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  available: vi.fn(),
  resolveRoute: vi.fn(),
  dispatchProvider: vi.fn(),
  reserve: vi.fn(),
  optOut: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/provider-training-opt-out', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readProviderTrainingOptOut: mocks.optOut,
}));
vi.mock('@/lib/services/provider-adapter-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listAvailableManagedProviderIds: mocks.available,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/request-processor', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveWebCloudModelRoute: mocks.resolveRoute,
}));
vi.mock('@/lib/services/aggregator-routing', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  dispatchProviderForSelectedRoute: mocks.dispatchProvider,
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  reserveManagedUsageRequest: mocks.reserve,
}));

const { ScannedTextWithheldError, transcribeScannedPages } =
  await import('./scanned-document-text');

function input(forceNoTraining?: boolean) {
  return {
    db: {} as never,
    userId: 'user-1',
    organizationId: null,
    planTier: 'pro',
    documentId: 'project-1:scan',
    pageImages: [{ mimeType: 'image/png' as const, base64: 'AAAA' }],
    ...(forceNoTraining === undefined ? {} : { forceNoTraining }),
  };
}

function selected(provider: string) {
  return {
    status: 'selected',
    provider,
    providerModelId: 'vision-model',
    modelKey: 'vision-model',
    routeId: `${provider}/vision`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.available.mockReturnValue(new Set(['openai', 'deepseek']));
  mocks.optOut.mockResolvedValue(false);
  mocks.resolveRoute.mockReturnValue(selected('openai'));
  mocks.dispatchProvider.mockImplementation((route: { provider: string }) => route.provider);
  // Stops the call at billing: these tests are about which route may be used.
  mocks.reserve.mockRejectedValue(new Error('stop at billing'));
});

describe('transcribeScannedPages and Google user data', () => {
  it('offers only providers that keep inputs out of training for a Google scan', async () => {
    await expect(transcribeScannedPages(input(true))).rejects.toThrow('stop at billing');

    const providers = mocks.resolveRoute.mock.calls[0]![6] as Set<string>;
    expect([...providers]).toEqual(['openai']);
  });

  it('withholds the scan without billing when no such provider is available', async () => {
    mocks.available.mockReturnValue(new Set(['deepseek']));

    await expect(transcribeScannedPages(input(true))).rejects.toBeInstanceOf(
      ScannedTextWithheldError,
    );
    expect(mocks.resolveRoute).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('withholds the scan when the selected route dispatches through a provider that may train', async () => {
    mocks.dispatchProvider.mockReturnValue('deepseek');

    await expect(transcribeScannedPages(input(true))).rejects.toBeInstanceOf(
      ScannedTextWithheldError,
    );
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('withholds the scan when no vision route is selected', async () => {
    mocks.resolveRoute.mockReturnValue({ status: 'unavailable', code: 'no_route' });

    await expect(transcribeScannedPages(input(true))).rejects.toBeInstanceOf(
      ScannedTextWithheldError,
    );
  });

  it('withholds a Google scan with the Google reason', async () => {
    mocks.available.mockReturnValue(new Set(['deepseek']));

    await expect(transcribeScannedPages(input(true))).rejects.toMatchObject({
      reason: 'google_user_data',
    });
  });
});

describe('transcribeScannedPages and the training opt-out setting', () => {
  it.each([
    ['on', () => mocks.optOut.mockResolvedValue(true)],
    ['unreadable', () => mocks.optOut.mockRejectedValue(new Error('connection reset'))],
  ])(
    'offers only no-training providers for any file while the setting is %s',
    async (_label, arrange) => {
      arrange();

      await expect(transcribeScannedPages(input())).rejects.toThrow('stop at billing');

      expect(mocks.optOut).toHaveBeenCalledWith(expect.anything(), 'user-1');
      const providers = mocks.resolveRoute.mock.calls[0]![6] as Set<string>;
      expect([...providers]).toEqual(['openai']);
    },
  );

  it('withholds the scan for an opted-out user when no such provider is available', async () => {
    mocks.optOut.mockResolvedValue(true);
    mocks.available.mockReturnValue(new Set(['deepseek']));

    const refusal = transcribeScannedPages(input());

    await expect(refusal).rejects.toBeInstanceOf(ScannedTextWithheldError);
    await expect(refusal).rejects.toMatchObject({ reason: 'training_opt_out' });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('withholds the scan for an opted-out user when the route dispatches through a provider that may train', async () => {
    mocks.optOut.mockResolvedValue(true);
    mocks.dispatchProvider.mockReturnValue('deepseek');

    await expect(transcribeScannedPages(input())).rejects.toMatchObject({
      reason: 'training_opt_out',
    });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('keeps an unrestricted pick while the setting is off', async () => {
    mocks.resolveRoute.mockReturnValue(selected('deepseek'));

    await expect(transcribeScannedPages(input())).rejects.toThrow('stop at billing');

    const providers = mocks.resolveRoute.mock.calls[0]![6] as Set<string>;
    expect([...providers].sort()).toEqual(['deepseek', 'openai']);
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ provider: 'deepseek' }));
  });

  it('routes an ordinary scan over every managed provider and returns null when none serves it', async () => {
    mocks.resolveRoute.mockReturnValue({ status: 'unavailable', code: 'no_route' });

    await expect(transcribeScannedPages(input())).resolves.toBeNull();
    const providers = mocks.resolveRoute.mock.calls[0]![6] as Set<string>;
    expect([...providers].sort()).toEqual(['deepseek', 'openai']);
  });
});

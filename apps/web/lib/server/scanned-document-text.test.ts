import { beforeEach, describe, expect, it, vi } from 'vitest';

type AdmissionModule = typeof import('@/lib/server/managed-cloud-routing/admission');

const mocks = vi.hoisted(() => ({
  admit: vi.fn(),
  reserve: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/server/managed-cloud-routing/admission', async (importOriginal) => ({
  ...(await importOriginal<AdmissionModule>()),
  admitManagedCloudRoute: mocks.admit,
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
    organizationId: 'org-1',
    planTier: 'pro',
    documentId: 'project-1:scan',
    pageImages: [{ mimeType: 'image/png' as const, base64: 'AAAA' }],
    ...(forceNoTraining === undefined ? {} : { forceNoTraining }),
  };
}

function admitted(provider: string, dispatchProvider = provider) {
  return {
    status: 'admitted',
    route: {
      status: 'selected',
      provider,
      providerModelId: 'vision-model',
      modelKey: 'vision-model',
      routeId: `${provider}/vision`,
    },
    dispatchProvider,
  };
}

function refused(reason: string) {
  return { status: 'refused', reason, code: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admit.mockResolvedValue(admitted('openai'));
  // Stops the call at billing: these tests are about which route may be used.
  mocks.reserve.mockRejectedValue(new Error('stop at billing'));
});

describe('transcribeScannedPages routing', () => {
  it('asks for a background vision route for the account and workspace on its plan', async () => {
    await expect(transcribeScannedPages(input())).rejects.toThrow('stop at billing');

    expect(mocks.admit).toHaveBeenCalledWith({
      kind: 'background',
      account: { db: expect.anything(), userId: 'user-1', organizationId: 'org-1' },
      planTier: 'pro',
      need: { taskType: 'multimodal', keepOutOfTraining: false },
    });
  });

  it('keeps a Google scan out of training', async () => {
    await expect(transcribeScannedPages(input(true))).rejects.toThrow('stop at billing');

    expect(mocks.admit).toHaveBeenCalledWith(
      expect.objectContaining({ need: { taskType: 'multimodal', keepOutOfTraining: true } }),
    );
  });

  it('reserves on the admitted route', async () => {
    mocks.admit.mockResolvedValue(admitted('deepseek'));

    await expect(transcribeScannedPages(input())).rejects.toThrow('stop at billing');

    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'deepseek', model: 'vision-model' }),
    );
  });
});

describe('transcribeScannedPages refusals', () => {
  it('withholds a Google scan with the Google reason and never bills', async () => {
    mocks.admit.mockResolvedValue(refused('no_training_route'));

    const refusal = transcribeScannedPages(input(true));

    await expect(refusal).rejects.toBeInstanceOf(ScannedTextWithheldError);
    await expect(refusal).rejects.toMatchObject({ reason: 'google_user_data' });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it('withholds a scan for an account kept out of training with the setting as the reason', async () => {
    mocks.admit.mockResolvedValue(refused('no_training_route'));

    await expect(transcribeScannedPages(input())).rejects.toMatchObject({
      reason: 'training_opt_out',
    });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it.each([['no_route'], ['policy_unreadable']])(
    'stores the scan without text when admission refuses with %s',
    async (reason) => {
      mocks.admit.mockResolvedValue(refused(reason));

      await expect(transcribeScannedPages(input())).resolves.toBeNull();
      expect(mocks.reserve).not.toHaveBeenCalled();
    },
  );
});

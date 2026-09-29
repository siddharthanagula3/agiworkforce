import { getProviderOfferings } from '@agiworkforce/types';
import { api } from '../services/api';
import { ApiHttpError } from '../services/apiErrors';
import {
  activateCloudAccount,
  __resetCloudAccountSessionForTests,
} from '../src/features/auth/services/cloudAccountSession';
import {
  ensureReadyFreeQuotaChatOffering,
  getFreeQuotaChatOffering,
  getReadyFreeQuotaChatOffering,
  useFreeQuotaCatalogueStore,
} from '../src/features/model-picker/freeQuotaCatalogue';
import { getModelListForCloudAccess } from '../src/features/model-picker/service';

jest.mock('../services/api', () => ({
  api: { get: jest.fn() },
  ApiHttpError: jest.requireActual('../services/apiErrors').ApiHttpError,
}));

const getMock = api.get as jest.Mock;
const offeringKey = Object.entries(getProviderOfferings()).find(
  ([, offering]) => offering.provider === 'qwen' && offering.quotaProbeProtocol === 'chat',
)?.[0];

function catalogue(status: 'ready' | 'exhausted') {
  if (!offeringKey) throw new Error('Expected a Qwen chat offering in the generated catalog.');
  return {
    issuer: 'QwenCloud',
    observedOn: '2026-09-26',
    evidenceUrl: 'https://docs.qwencloud.com/resources/free-quota',
    reportedEligible: 1,
    reportedUnavailable: 0,
    models: [
      {
        key: offeringKey,
        displayName: 'Provider-funded chat',
        providerModelId: null,
        category: 'chat',
        limit: 100,
        unit: 'tokens',
        consumedApproximate: 0,
        expiresOn: null,
        status,
      },
    ],
  };
}

describe('mobile provider-funded Free catalogue', () => {
  beforeEach(() => {
    getMock.mockReset();
    __resetCloudAccountSessionForTests();
    useFreeQuotaCatalogueStore.getState().clear();
  });

  it('loads only server-ready offerings for the signed-in account', async () => {
    activateCloudAccount('account-a');
    getMock.mockResolvedValue(catalogue('ready'));
    await useFreeQuotaCatalogueStore.getState().refresh();
    expect(getMock).toHaveBeenCalledWith('/api/models/free-quota');
    expect(getReadyFreeQuotaChatOffering(offeringKey!)).not.toBeNull();

    getMock.mockResolvedValue(catalogue('exhausted'));
    await useFreeQuotaCatalogueStore.getState().refresh();
    expect(getFreeQuotaChatOffering(offeringKey!)?.status).toBe('exhausted');
    expect(getReadyFreeQuotaChatOffering(offeringKey!)).toBeNull();
  });

  it('rechecks a ready account-bound offering before each send', async () => {
    activateCloudAccount('account-a');
    getMock.mockResolvedValue(catalogue('ready'));

    expect(await ensureReadyFreeQuotaChatOffering(offeringKey!)).toMatchObject({ status: 'ready' });
    getMock.mockResolvedValue(catalogue('exhausted'));
    expect(await ensureReadyFreeQuotaChatOffering(offeringKey!)).toBeNull();
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it('shares an in-flight account check between the picker and a send', async () => {
    activateCloudAccount('account-a');
    let resolveCatalogue!: (value: ReturnType<typeof catalogue>) => void;
    getMock.mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof catalogue>>((resolve) => {
          resolveCatalogue = resolve;
        }),
    );

    const pickerRefresh = useFreeQuotaCatalogueStore.getState().refresh();
    const readyForSend = ensureReadyFreeQuotaChatOffering(offeringKey!);
    await Promise.resolve();
    expect(getMock).toHaveBeenCalledTimes(1);

    resolveCatalogue(catalogue('ready'));
    await pickerRefresh;
    expect(await readyForSend).toMatchObject({ status: 'ready' });
  });

  it('does not let an old account refresh replace a new account result', async () => {
    activateCloudAccount('account-a');
    let resolveOldCatalogue!: (value: ReturnType<typeof catalogue>) => void;
    getMock.mockImplementationOnce(
      () =>
        new Promise<ReturnType<typeof catalogue>>((resolve) => {
          resolveOldCatalogue = resolve;
        }),
    );
    const oldRefresh = useFreeQuotaCatalogueStore.getState().refresh();
    await Promise.resolve();

    activateCloudAccount('account-b');
    getMock.mockResolvedValueOnce(catalogue('exhausted'));
    await useFreeQuotaCatalogueStore.getState().refresh();
    resolveOldCatalogue(catalogue('ready'));
    await oldRefresh;

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(getFreeQuotaChatOffering(offeringKey!)?.status).toBe('exhausted');
  });

  it('does not reuse a ready offering after the account changes', async () => {
    activateCloudAccount('account-a');
    getMock.mockResolvedValue(catalogue('ready'));
    await ensureReadyFreeQuotaChatOffering(offeringKey!);

    activateCloudAccount('account-b');
    getMock.mockResolvedValue(catalogue('exhausted'));
    expect(await ensureReadyFreeQuotaChatOffering(offeringKey!)).toBeNull();
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it('does not send with a cached ready offering when the pre-send refresh fails', async () => {
    activateCloudAccount('account-a');
    getMock.mockResolvedValue(catalogue('ready'));
    await useFreeQuotaCatalogueStore.getState().refresh();

    getMock.mockRejectedValueOnce(new Error('offline'));
    expect(await ensureReadyFreeQuotaChatOffering(offeringKey!)).toBeNull();
    expect(useFreeQuotaCatalogueStore.getState().error).toBe(
      'Could not check provider-funded Free models. Check your connection and retry.',
    );
  });

  it('does not expose another account’s catalogue after switching accounts', async () => {
    activateCloudAccount('account-a');
    getMock.mockResolvedValue(catalogue('ready'));
    await useFreeQuotaCatalogueStore.getState().refresh();
    activateCloudAccount('account-b');
    expect(getReadyFreeQuotaChatOffering(offeringKey!)).toBeNull();
  });

  it('renders Free models only from the current account catalogue snapshot', async () => {
    activateCloudAccount('account-a');
    getMock.mockResolvedValue(catalogue('ready'));
    await useFreeQuotaCatalogueStore.getState().refresh();
    const current = useFreeQuotaCatalogueStore.getState().catalogue;
    if (!current) throw new Error('Expected the account catalogue.');
    const displayed = () =>
      getModelListForCloudAccess(true, 'free', current).find((model) => model.id === offeringKey);

    expect(displayed()?.name).toBe('Provider-funded chat');
    expect(
      getModelListForCloudAccess(true, 'free', {
        ...current,
        models: current.models.map((model) => ({ ...model, displayName: 'Stale account label' })),
      }).find((model) => model.id === offeringKey),
    ).toBeUndefined();

    activateCloudAccount('account-b');
    expect(displayed()).toBeUndefined();
  });

  it('distinguishes an empty provider catalogue from an authentication failure', async () => {
    activateCloudAccount('account-a');
    getMock.mockResolvedValueOnce(null);
    await useFreeQuotaCatalogueStore.getState().refresh();
    expect(useFreeQuotaCatalogueStore.getState()).toMatchObject({
      catalogue: null,
      loading: false,
      error: null,
    });

    getMock.mockRejectedValueOnce(new ApiHttpError('Unauthorized', 401));
    await useFreeQuotaCatalogueStore.getState().refresh();
    expect(useFreeQuotaCatalogueStore.getState().error).toBe(
      'Sign in again to check provider-funded Free models.',
    );
  });

  it('explains plan and server availability failures without showing raw errors', async () => {
    activateCloudAccount('account-a');
    getMock.mockRejectedValueOnce(new ApiHttpError('Internal plan detail', 403));
    await useFreeQuotaCatalogueStore.getState().refresh();
    expect(useFreeQuotaCatalogueStore.getState().error).toBe(
      'Provider-funded Free models are unavailable on this plan.',
    );

    getMock.mockRejectedValueOnce(new ApiHttpError('Internal route detail', 404));
    await useFreeQuotaCatalogueStore.getState().refresh();
    expect(useFreeQuotaCatalogueStore.getState().error).toBe(
      'Provider-funded Free models are unavailable from AGI Cloud right now.',
    );
  });
});

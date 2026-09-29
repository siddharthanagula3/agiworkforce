import { create } from 'zustand';
import {
  FREE_QUOTA_CATALOGUE_PATH,
  FreeQuotaCatalogueSchema,
  type FreeQuotaCatalogue,
  type FreeQuotaModel,
} from '@agiworkforce/cloud-contracts';
import { getProviderOffering } from '@agiworkforce/types';
import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

interface FreeQuotaCatalogueState {
  account: CloudAccountEpoch | null;
  catalogue: FreeQuotaCatalogue | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clear: () => void;
}

let refreshSerial = 0;
let activeRefresh: { account: CloudAccountEpoch; promise: Promise<void> } | null = null;

export const useFreeQuotaCatalogueStore = create<FreeQuotaCatalogueState>((set) => ({
  account: null,
  catalogue: null,
  loading: false,
  error: null,
  refresh: () => {
    const account = captureCloudAccountEpoch();
    if (!account) {
      refreshSerial += 1;
      activeRefresh = null;
      set({ account: null, catalogue: null, loading: false, error: null });
      return Promise.resolve();
    }
    if (
      activeRefresh?.account.ownerId === account.ownerId &&
      activeRefresh.account.epoch === account.epoch
    ) {
      return activeRefresh.promise;
    }
    const serial = ++refreshSerial;
    set({ account, catalogue: null, loading: true, error: null });
    const promise = Promise.resolve()
      .then(() => api.get<unknown>(FREE_QUOTA_CATALOGUE_PATH))
      .then((raw) => {
        if (serial !== refreshSerial || !isCloudAccountEpochCurrent(account)) return;
        const catalogue = raw === null ? null : FreeQuotaCatalogueSchema.parse(raw);
        set({ account, catalogue, loading: false, error: null });
      })
      .catch((error) => {
        if (serial !== refreshSerial || !isCloudAccountEpochCurrent(account)) return;
        set({
          account,
          catalogue: null,
          loading: false,
          error:
            error instanceof ApiHttpError && error.status === 401
              ? 'Sign in again to check provider-funded Free models.'
              : error instanceof ApiHttpError && error.status === 403
                ? 'Provider-funded Free models are unavailable on this plan.'
                : error instanceof ApiHttpError && error.status === 404
                  ? 'Provider-funded Free models are unavailable from AGI Cloud right now.'
                  : 'Could not check provider-funded Free models. Check your connection and retry.',
        });
      })
      .finally(() => {
        if (activeRefresh?.promise === promise) activeRefresh = null;
      });
    activeRefresh = { account, promise };
    return promise;
  },
  clear: () => {
    refreshSerial += 1;
    activeRefresh = null;
    set({ account: null, catalogue: null, loading: false, error: null });
  },
}));

export function getFreeQuotaChatOffering(key: string): FreeQuotaModel | null {
  const state = useFreeQuotaCatalogueStore.getState();
  const account = captureCloudAccountEpoch();
  if (
    !account ||
    !state.account ||
    account.ownerId !== state.account.ownerId ||
    account.epoch !== state.account.epoch
  ) {
    return null;
  }
  const model = state.catalogue?.models.find((entry) => entry.key === key);
  if (!model || model.category !== 'chat') return null;
  const offering = getProviderOffering(key);
  return offering?.quotaProbeProtocol === 'chat' ? model : null;
}

export function getReadyFreeQuotaChatOffering(key: string): FreeQuotaModel | null {
  const model = getFreeQuotaChatOffering(key);
  return model?.status === 'ready' ? model : null;
}

export async function ensureReadyFreeQuotaChatOffering(
  key: string,
): Promise<FreeQuotaModel | null> {
  await useFreeQuotaCatalogueStore.getState().refresh();
  return getReadyFreeQuotaChatOffering(key);
}

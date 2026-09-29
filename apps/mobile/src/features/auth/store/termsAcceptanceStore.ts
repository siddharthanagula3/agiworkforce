import { create } from 'zustand';
import {
  TERMS_ACCEPTANCE_PATH,
  TermsAcceptanceSchema,
  TermsStatusSchema,
} from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';
import { ApiHttpError, CloudCredentialUnavailableError } from '@/services/apiErrors';

type TermsStatus = 'idle' | 'checking' | 'required' | 'accepting' | 'accepted' | 'error';

interface TermsAcceptanceState {
  userId: string | null;
  status: TermsStatus;
  currentVersion: string | null;
  error: string | null;
  verify: (userId: string) => Promise<void>;
  recheck: (userId: string) => Promise<void>;
  accept: (userId: string) => Promise<void>;
  reset: () => void;
}

let requestGeneration = 0;

export const useTermsAcceptanceStore = create<TermsAcceptanceState>()((set, get) => ({
  userId: null,
  status: 'idle',
  currentVersion: null,
  error: null,

  verify: async (userId) => {
    const generation = ++requestGeneration;
    set({ userId, status: 'checking', currentVersion: null, error: null });
    try {
      const result = TermsStatusSchema.parse(await api.get<unknown>(TERMS_ACCEPTANCE_PATH));
      if (get().userId !== userId || requestGeneration !== generation) return;
      set({
        status: result.accepted ? 'accepted' : 'required',
        currentVersion: result.currentVersion,
      });
    } catch (error) {
      if (get().userId === userId && requestGeneration === generation) {
        set({
          status: 'error',
          error:
            error instanceof CloudCredentialUnavailableError
              ? 'AGI Cloud could not verify this device session. Retry, or continue in Local Mode.'
              : error instanceof ApiHttpError && error.code === 'PASSKEY_REQUIRED'
                ? 'Advanced Account Security is on for this account. Verify with one of your passkeys, then this check runs again.'
                : error instanceof ApiHttpError && error.status === 405
                  ? 'AGI Cloud needs a service update before sign-in can finish. Continue in Local Mode and try again after the update.'
                  : 'Could not check your Terms status. Retry to use AGI Cloud.',
        });
      }
    }
  },

  recheck: async (userId) => {
    const state = get();
    if (state.userId !== userId || state.status !== 'accepted') return get().verify(userId);
    const generation = ++requestGeneration;
    try {
      const result = TermsStatusSchema.parse(await api.get<unknown>(TERMS_ACCEPTANCE_PATH));
      if (get().userId !== userId || requestGeneration !== generation) return;
      set(
        result.accepted
          ? { currentVersion: result.currentVersion }
          : { status: 'required', currentVersion: result.currentVersion },
      );
    } catch (error) {
      console.warn('[terms] recheck failed, keeping the current standing', error);
    }
  },

  accept: async (userId) => {
    const state = get();
    if (state.userId !== userId || state.status !== 'required' || !state.currentVersion) return;
    const generation = ++requestGeneration;
    set({ status: 'accepting', error: null });
    try {
      const result = TermsAcceptanceSchema.parse(
        await api.post<unknown>(TERMS_ACCEPTANCE_PATH, {
          surface: 'mobile-auth',
          version: state.currentVersion,
        }),
      );
      if (get().userId !== userId || requestGeneration !== generation) return;
      if (result.version !== state.currentVersion) {
        throw new Error('The Terms changed. Review the current version before continuing.');
      }
      set({ status: 'accepted', error: null });
    } catch (error) {
      if (get().userId !== userId || requestGeneration !== generation) return;
      const latestVersion =
        error instanceof ApiHttpError && error.status === 409
          ? error.body?.['currentVersion']
          : undefined;
      if (typeof latestVersion === 'string' && latestVersion) {
        set({
          status: 'required',
          currentVersion: latestVersion,
          error: 'The Terms changed. Review the current version before continuing.',
        });
        return;
      }
      set({
        status: 'error',
        currentVersion: null,
        error: 'Could not record your agreement. Retry and review the current Terms.',
      });
    }
  },

  reset: () => {
    requestGeneration += 1;
    set({ userId: null, status: 'idle', currentVersion: null, error: null });
  },
}));

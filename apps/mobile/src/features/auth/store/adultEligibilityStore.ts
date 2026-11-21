import { create } from 'zustand';
import {
  ADULT_ELIGIBILITY_ERROR_CODES,
  ADULT_ELIGIBILITY_PATH,
  AdultEligibilityStatusSchema,
  type AdultEligibilityRequest,
  type AdultEligibilityStatus as ServerEligibilityStatus,
} from '@agiworkforce/cloud-contracts';
import type { AdultEligibilityEvidence } from '@agiworkforce/types';
import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';
import { confirmAgeGate, deviceAdultEvidence } from '@/src/features/auth/services/ageGate';

export type AdultEligibilityCheckStatus =
  'idle' | 'checking' | 'confirmed' | 'age_required' | 'submitting' | 'ineligible' | 'error';

interface AdultEligibilityState {
  userId: string | null;
  status: AdultEligibilityCheckStatus;
  error: string | null;
  verify: (userId: string) => Promise<void>;
  submitAge: (userId: string, age: number) => Promise<void>;
  reportDeviceGateAnswer: (typedAge: number | null) => Promise<void>;
  reset: () => void;
}

export const ADULT_ELIGIBILITY_CHECK_FAILED_MESSAGE =
  'Could not confirm your age for AGI Cloud. Retry to continue.';

export function isAdultEligibilityAnswerPending(
  eligibility: Pick<AdultEligibilityState, 'userId' | 'status'>,
  userId: string,
): boolean {
  return (
    eligibility.userId !== userId ||
    eligibility.status === 'idle' ||
    eligibility.status === 'checking'
  );
}

export function isAdultEligibilityConfirmed(
  eligibility: Pick<AdultEligibilityState, 'userId' | 'status'>,
  userId: string | null | undefined,
): boolean {
  return Boolean(userId) && eligibility.userId === userId && eligibility.status === 'confirmed';
}

export function adultEligibilityNeedsAnswer(
  eligibility: Pick<AdultEligibilityState, 'userId' | 'status'>,
  userId: string | null | undefined,
): boolean {
  return (
    Boolean(userId) &&
    eligibility.userId === userId &&
    (eligibility.status === 'age_required' ||
      eligibility.status === 'ineligible' ||
      eligibility.status === 'error')
  );
}

type Outcome = Exclude<AdultEligibilityCheckStatus, 'idle' | 'checking' | 'submitting'>;

function outcomeOfStatus(status: ServerEligibilityStatus): Outcome | null {
  if (status.state === 'confirmed') return 'confirmed';
  if (status.state === 'ineligible') return 'ineligible';
  return null;
}

async function report(evidence: AdultEligibilityEvidence): Promise<Outcome> {
  const request: AdultEligibilityRequest = { surface: 'mobile-auth', evidence };
  try {
    const status = AdultEligibilityStatusSchema.parse(
      await api.post<unknown>(ADULT_ELIGIBILITY_PATH, request),
    );
    return outcomeOfStatus(status) ?? 'error';
  } catch (error) {
    if (error instanceof ApiHttpError) {
      if (error.code === ADULT_ELIGIBILITY_ERROR_CODES.ineligible) return 'ineligible';
      if (error.code === ADULT_ELIGIBILITY_ERROR_CODES.inconclusive) return 'age_required';
    }
    throw error;
  }
}

let requestGeneration = 0;

export const useAdultEligibilityStore = create<AdultEligibilityState>()((set, get) => {
  const settle = (userId: string, generation: number, outcome: Outcome) => {
    if (get().userId !== userId || requestGeneration !== generation) return;
    set({
      status: outcome,
      error: outcome === 'error' ? ADULT_ELIGIBILITY_CHECK_FAILED_MESSAGE : null,
    });
  };

  const fail = (userId: string, generation: number, error: unknown) => {
    if (get().userId !== userId || requestGeneration !== generation) return;
    console.warn('[eligibility] check failed, Cloud stays closed', error);
    set({ status: 'error', error: ADULT_ELIGIBILITY_CHECK_FAILED_MESSAGE });
  };

  return {
    userId: null,
    status: 'idle',
    error: null,

    verify: async (userId) => {
      const generation = ++requestGeneration;
      set({ userId, status: 'checking', error: null });
      try {
        const status = AdultEligibilityStatusSchema.parse(
          await api.get<unknown>(ADULT_ELIGIBILITY_PATH),
        );
        const known = outcomeOfStatus(status);
        if (known) return settle(userId, generation, known);
        if (get().userId !== userId || requestGeneration !== generation) return;
        const evidence = deviceAdultEvidence();
        if (!evidence) return settle(userId, generation, 'age_required');
        settle(userId, generation, await report(evidence));
      } catch (error) {
        if (
          error instanceof ApiHttpError &&
          error.code === ADULT_ELIGIBILITY_ERROR_CODES.ineligible
        ) {
          return settle(userId, generation, 'ineligible');
        }
        fail(userId, generation, error);
      }
    },

    submitAge: async (userId, age) => {
      const state = get();
      if (state.userId !== userId || state.status !== 'age_required') return;
      const generation = ++requestGeneration;
      set({ status: 'submitting', error: null });
      confirmAgeGate(age);
      try {
        settle(userId, generation, await report({ kind: 'declared_age', age }));
      } catch (error) {
        if (get().userId !== userId || requestGeneration !== generation) return;
        console.warn('[eligibility] age report failed, Cloud stays closed', error);
        set({ status: 'age_required', error: ADULT_ELIGIBILITY_CHECK_FAILED_MESSAGE });
      }
    },

    reportDeviceGateAnswer: async (typedAge) => {
      const { userId, status } = get();
      if (!userId || status !== 'age_required') return;
      if (typedAge === null) return get().verify(userId);
      return get().submitAge(userId, typedAge);
    },

    reset: () => {
      requestGeneration += 1;
      set({ userId: null, status: 'idle', error: null });
    },
  };
});

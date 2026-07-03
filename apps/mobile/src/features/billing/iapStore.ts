/**
 * IAP purchase-flow state machine.
 *
 * Not persisted (MMKV) on purpose — purchase status is session-scoped UI state,
 * not app data. The source of truth for "what plan is the user on" is the
 * server (`useTierStore`, refreshed from `/api/me`), not this store.
 */
import { create } from 'zustand';
import type { BillingInterval } from '@agiworkforce/types';
import type { PurchasableTier } from './iapProducts';

export type IapFlowStatus =
  | 'idle'
  | 'connecting'
  | 'purchasing'
  | 'verifying'
  | 'success'
  | 'error'
  | 'restoring';

interface IapState {
  status: IapFlowStatus;
  /** Tier/interval currently mid-purchase, if any. */
  pendingRequest: { tier: PurchasableTier; interval: BillingInterval } | null;
  errorMessage: string | null;
  setStatus: (status: IapFlowStatus) => void;
  startPurchase: (tier: PurchasableTier, interval: BillingInterval) => void;
  markVerifying: () => void;
  markSuccess: () => void;
  markError: (message: string) => void;
  reset: () => void;
}

export const useIapStore = create<IapState>()((set) => ({
  status: 'idle',
  pendingRequest: null,
  errorMessage: null,

  setStatus: (status) => set({ status }),

  startPurchase: (tier, interval) =>
    set({ status: 'purchasing', pendingRequest: { tier, interval }, errorMessage: null }),

  markVerifying: () => set({ status: 'verifying' }),

  markSuccess: () => set({ status: 'success', pendingRequest: null, errorMessage: null }),

  markError: (message) => set({ status: 'error', errorMessage: message }),

  reset: () => set({ status: 'idle', pendingRequest: null, errorMessage: null }),
}));

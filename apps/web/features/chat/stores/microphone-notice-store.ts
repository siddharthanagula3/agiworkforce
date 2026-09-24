import { create } from 'zustand';

import { useBillingStore } from '@shared/stores/web-auth-store';
import { readAcknowledgedAccount, rememberAcknowledgedAccount } from '../lib/account-notice';
import { MICROPHONE_NOTICE_STORAGE_KEY } from '../lib/microphone-notice-copy';

const SIGNED_OUT = '';

interface MicrophoneRequest {
  owner: string;
  start: () => void;
}

interface MicrophoneNoticeState {
  request: MicrophoneRequest | null;
  acknowledgedThisSession: string | null;
  askForMicrophone: (owner: string, start: () => void) => void;
  withdraw: (owner: string) => void;
  acknowledge: () => void;
  decline: () => void;
}

function currentAccount(): string {
  return useBillingStore.getState().user?.id ?? SIGNED_OUT;
}

/**
 * The first capture on an account waits for the reader to have been told where
 * the audio goes; every capture after that starts in the same click.
 */
export const useMicrophoneNoticeStore = create<MicrophoneNoticeState>()((set, get) => ({
  request: null,
  acknowledgedThisSession: null,

  askForMicrophone: (owner, start) => {
    const account = currentAccount();
    const acknowledged =
      get().acknowledgedThisSession === account ||
      (account !== SIGNED_OUT &&
        readAcknowledgedAccount(MICROPHONE_NOTICE_STORAGE_KEY) === account);
    if (acknowledged) {
      start();
      return;
    }
    set({ request: { owner, start } });
  },

  withdraw: (owner) => {
    if (get().request?.owner === owner) set({ request: null });
  },

  acknowledge: () => {
    const { request } = get();
    const account = currentAccount();
    if (account !== SIGNED_OUT) rememberAcknowledgedAccount(MICROPHONE_NOTICE_STORAGE_KEY, account);
    set({ request: null, acknowledgedThisSession: account });
    request?.start();
  },

  decline: () => set({ request: null }),
}));

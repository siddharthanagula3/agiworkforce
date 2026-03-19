'use client';

/**
 * BYOK (Bring Your Own Key) store.
 * Keys are stored in localStorage via Zustand persist.
 * They never leave the device — the web app passes them directly to AI provider APIs
 * on the client side and does not send them to AGI Workforce servers.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ApiKeysState {
  openaiKey: string;
  anthropicKey: string;
  googleKey: string;
  // Actions
  setKeys: (keys: { openaiKey: string; anthropicKey: string; googleKey: string }) => void;
}

export const useApiKeysStore = create<ApiKeysState>()(
  persist(
    (set) => ({
      openaiKey: '',
      anthropicKey: '',
      googleKey: '',
      setKeys: (keys) => set(keys),
    }),
    {
      name: 'agiworkforce-web-api-keys',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

'use client';

import { createContext, useContext, useState } from 'react';

import { PRODUCT_UPDATES_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { useRefusedByGlobalPrivacyControl } from '@/lib/hooks/useRefusedByGlobalPrivacyControl';

export interface ProductUpdatesChoice {
  wanted: boolean;
  refusedBySignal: boolean;
  choose: (next: boolean) => void;
}

export function useProductUpdatesChoice(signalledByRequest = false): ProductUpdatesChoice {
  const [ticked, setTicked] = useState(false);
  const refusedBySignal = useRefusedByGlobalPrivacyControl(
    PRODUCT_UPDATES_CONSENT_PURPOSE.id,
    signalledByRequest,
  );

  return { wanted: ticked && !refusedBySignal, refusedBySignal, choose: setTicked };
}

const ProductUpdatesGrantContext = createContext<string | null>(null);

export const ProductUpdatesGrantProvider = ProductUpdatesGrantContext.Provider;

export function useProductUpdatesGrant(): string | null {
  return useContext(ProductUpdatesGrantContext);
}

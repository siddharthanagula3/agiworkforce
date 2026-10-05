'use client';

import { createContext, useContext, useState } from 'react';

import { MARKETING_EMAIL_CONSENT_PURPOSE } from '@/lib/consent-purposes';
import { useRefusedByGlobalPrivacyControl } from '@/lib/hooks/useRefusedByGlobalPrivacyControl';

export interface MarketingEmailChoice {
  wanted: boolean;
  refusedBySignal: boolean;
  choose: (next: boolean) => void;
}

export function useMarketingEmailChoice(signalledByRequest = false): MarketingEmailChoice {
  const [ticked, setTicked] = useState(false);
  const refusedBySignal = useRefusedByGlobalPrivacyControl(
    MARKETING_EMAIL_CONSENT_PURPOSE.id,
    signalledByRequest,
  );

  return { wanted: ticked && !refusedBySignal, refusedBySignal, choose: setTicked };
}

const MarketingEmailGrantContext = createContext<string | null>(null);

export const MarketingEmailGrantProvider = MarketingEmailGrantContext.Provider;

export function useMarketingEmailGrant(): string | null {
  return useContext(MarketingEmailGrantContext);
}

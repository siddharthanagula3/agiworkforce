'use client';

import { useSyncExternalStore } from 'react';

import {
  isNonEssentialConsentPurpose,
  readBrowserGlobalPrivacyControl,
} from '@/lib/consent-signals';

const neverChanges = () => () => undefined;
const unknownOnServer = () => false;

// The header answered for one request and the property answers for this
// browser. Either one is the visitor opting out, so neither clears the other.
export function useRefusedByGlobalPrivacyControl(
  purpose: string,
  signalledByRequest = false,
): boolean {
  const signalledByBrowser = useSyncExternalStore(
    neverChanges,
    readBrowserGlobalPrivacyControl,
    unknownOnServer,
  );
  return (signalledByRequest || signalledByBrowser) && isNonEssentialConsentPurpose(purpose);
}

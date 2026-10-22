import {
  assertLlmGate,
  isLlmGateOpen as _isLlmGateOpen,
  Article50DisclosureRequiredError,
  ChineseHqProviderNotOptedInError,
} from '@agiworkforce/compliance';
import { mmkvDisclosureLedger, mmkvRoutingConsentLedger } from './complianceLedger';
import {
  CloudProviderConsentDeclinedError,
  CloudProviderConsentRequiredError,
  ensureCloudProviderConsent,
  hasCurrentCloudProviderConsent,
} from './providerConsent';

export {
  Article50DisclosureRequiredError,
  ChineseHqProviderNotOptedInError,
  CloudProviderConsentDeclinedError,
  CloudProviderConsentRequiredError,
};

export function ensureLlmGateOpen(providerId: string): void {
  assertLlmGate({
    providerId,
    disclosureLedger: mmkvDisclosureLedger,
    consentLedger: mmkvRoutingConsentLedger,
    requireManagedCloud: false,
  });
  if (!hasCurrentCloudProviderConsent()) throw new CloudProviderConsentRequiredError();
}

export function isLlmGateOpen(providerId: string): boolean {
  return (
    _isLlmGateOpen({
      providerId,
      disclosureLedger: mmkvDisclosureLedger,
      consentLedger: mmkvRoutingConsentLedger,
      requireManagedCloud: false,
    }) && hasCurrentCloudProviderConsent()
  );
}

export async function ensureCloudSendConsent(): Promise<void> {
  if (!(await ensureCloudProviderConsent())) throw new CloudProviderConsentDeclinedError();
}

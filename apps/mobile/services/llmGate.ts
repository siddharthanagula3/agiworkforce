import {
  assertLlmGate,
  isLlmGateOpen as _isLlmGateOpen,
  Article50DisclosureRequiredError,
  ChineseHqProviderNotOptedInError,
} from '@agiworkforce/compliance';
import { mmkvDisclosureLedger, mmkvRoutingConsentLedger } from './complianceLedger';

export { Article50DisclosureRequiredError, ChineseHqProviderNotOptedInError };

export function ensureLlmGateOpen(providerId: string): void {
  assertLlmGate({
    providerId,
    disclosureLedger: mmkvDisclosureLedger,
    consentLedger: mmkvRoutingConsentLedger,
    requireManagedCloud: false,
  });
}

export function isLlmGateOpen(providerId: string): boolean {
  return _isLlmGateOpen({
    providerId,
    disclosureLedger: mmkvDisclosureLedger,
    consentLedger: mmkvRoutingConsentLedger,
    requireManagedCloud: false,
  });
}

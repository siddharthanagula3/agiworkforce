
import {
  assertLlmGate,
  isLlmGateOpen as _isLlmGateOpen,
  Article50DisclosureRequiredError,
  ChineseHqProviderNotOptedInError,
} from '@agiworkforce/compliance';
import { mmkvDisclosureLedger, mmkvConsentLedger } from './complianceLedger';

export { Article50DisclosureRequiredError, ChineseHqProviderNotOptedInError };

export function ensureLlmGateOpen(providerId: string): void {
  assertLlmGate({
    providerId,
    disclosureLedger: mmkvDisclosureLedger,
    consentLedger: mmkvConsentLedger,
    requireManagedCloud: false,
  });
}

export function isLlmGateOpen(providerId: string): boolean {
  return _isLlmGateOpen({
    providerId,
    disclosureLedger: mmkvDisclosureLedger,
    consentLedger: mmkvConsentLedger,
    requireManagedCloud: false,
  });
}

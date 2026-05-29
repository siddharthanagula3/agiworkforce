/**
 * LLM gate wrapper for mobile.
 *
 * Wraps @agiworkforce/compliance assertLlmGate() / isLlmGateOpen() with the
 * MMKV-backed ledger instances. Call `ensureLlmGateOpen()` before every LLM
 * HTTP request. On Article50DisclosureRequiredError, route the user back to
 * the onboarding disclosure screen.
 *
 * Mobile has three product modes: Local Mode + Local LLMs, future lightweight
 * Local Mode on Mobile and Cloud Managed after explicit invite unlock.
 * This wrapper is only for outbound provider/API requests after a
 * mode-specific gate allows them. Local-LLM requests and heavy
 * generated-file/browser/code environments should never reach this path.
 */

import {
  assertLlmGate,
  isLlmGateOpen as _isLlmGateOpen,
  Article50DisclosureRequiredError,
  ChineseHqProviderNotOptedInError,
} from '@agiworkforce/compliance';
import { mmkvDisclosureLedger, mmkvConsentLedger } from './complianceLedger';

export { Article50DisclosureRequiredError, ChineseHqProviderNotOptedInError };

/**
 * Throws Article50DisclosureRequiredError if the user has not accepted the
 * Article 50(1) disclosure. Throws ChineseHqProviderNotOptedInError if the
 * requested provider is a Chinese-HQ provider the user has not opted into.
 *
 * Call this before every /api/llm/* or provider-stream request.
 */
export function ensureLlmGateOpen(providerId: string): void {
  assertLlmGate({
    providerId,
    disclosureLedger: mmkvDisclosureLedger,
    consentLedger: mmkvConsentLedger,
    requireManagedCloud: false,
  });
}

/**
 * Non-throwing predicate. Returns false when the gate would block — useful
 * for rendering the composer in a "disabled" state before the user sends.
 */
export function isLlmGateOpen(providerId: string): boolean {
  return _isLlmGateOpen({
    providerId,
    disclosureLedger: mmkvDisclosureLedger,
    consentLedger: mmkvConsentLedger,
    requireManagedCloud: false,
  });
}

/**
 * llm-gate — runs in front of every `/api/llm/*` request.
 *
 * Two checks, in order:
 *
 *   1. Article 50(1) disclosure must be satisfied (the user has seen and
 *      accepted the "you are interacting with an AI system" disclosure).
 *      If not satisfied: throws `Article50DisclosureRequiredError`.
 *
 *   2. Per-provider R-023 gate. If the requested provider is on the
 *      Chinese-HQ list and the user has NOT opted in, throws
 *      `ChineseHqProviderNotOptedInError`.
 *
 * The host app's HTTP client wraps each LLM call in this gate. The mobile
 * integration is in `apps/mobile/services/streaming.ts` (called before the
 * `secureFetch`). The web integration is in
 * `apps/web/features/chat/lib/chatClient.ts` (called before the
 * `fetch('/api/llm/v1/chat/completions')`).
 *
 * Errors are typed sentinels so the host app can route them to the right
 * UX: a disclosure error reopens the onboarding modal; a provider error
 * opens the Chinese-HQ named-provider opt-in sheet.
 */

import { isDisclosureSatisfied, type DisclosureLedger } from './article50-disclosure';
import { isProviderRoutingAllowed, type ConsentLedger } from './provider-jurisdiction';

/**
 * Thrown when the LLM gate is asked to permit a call before the user has
 * accepted the Article 50(1) disclosure.
 */
export class Article50DisclosureRequiredError extends Error {
  override readonly name = 'Article50DisclosureRequiredError' as const;
  readonly code = 'article50_disclosure_required' as const;

  constructor() {
    super(
      'EU AI Act Article 50(1) disclosure has not been accepted. Show the ' +
        'first-run disclosure before issuing any /api/llm/* request.',
    );
  }
}

/**
 * Thrown when the LLM gate is asked to route to a Chinese-HQ provider the
 * user has not opted into.
 */
export class ChineseHqProviderNotOptedInError extends Error {
  override readonly name = 'ChineseHqProviderNotOptedInError' as const;
  readonly code = 'cn_hq_provider_not_opted_in' as const;
  readonly providerId: string;

  constructor(providerId: string) {
    super(
      `Provider ${providerId} is headquartered in China and is OFF by default ` +
        '(EU AI Act Article 50(1) + Apple 5.1.2(i) per-provider consent). ' +
        'Prompt the user with the named-provider opt-in sheet first.',
    );
    this.providerId = providerId;
  }
}

/**
 * The LLM gate.
 *
 * @param providerId        Provider id from `models.json` (lowercased).
 * @param disclosureLedger  Mobile: MMKV-backed. Web: Supabase-backed.
 * @param consentLedger     Mobile + web: same store, indexed by providerId.
 * @param requireManagedCloud  True when the call is going through managed
 *                             routing (Hobby+ tiers). False for BYOK + Local.
 *
 * @throws Article50DisclosureRequiredError
 * @throws ChineseHqProviderNotOptedInError
 */
export function assertLlmGate(args: {
  providerId: string;
  disclosureLedger: DisclosureLedger;
  consentLedger: ConsentLedger;
  requireManagedCloud: boolean;
}): void {
  if (!isDisclosureSatisfied(args.disclosureLedger, args.requireManagedCloud)) {
    throw new Article50DisclosureRequiredError();
  }
  if (!isProviderRoutingAllowed(args.providerId, args.consentLedger)) {
    throw new ChineseHqProviderNotOptedInError(args.providerId);
  }
}

/**
 * Predicate variant — same logic, returns boolean instead of throwing.
 * Useful when the host app wants to render a "disabled" state on the chat
 * composer rather than wait for a thrown error at send time.
 */
export function isLlmGateOpen(args: {
  providerId: string;
  disclosureLedger: DisclosureLedger;
  consentLedger: ConsentLedger;
  requireManagedCloud: boolean;
}): boolean {
  if (!isDisclosureSatisfied(args.disclosureLedger, args.requireManagedCloud)) return false;
  if (!isProviderRoutingAllowed(args.providerId, args.consentLedger)) return false;
  return true;
}

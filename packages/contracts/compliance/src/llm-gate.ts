
import { isDisclosureSatisfied, type DisclosureLedger } from './article50-disclosure';
import { isProviderRoutingAllowed, type ConsentLedger } from './provider-jurisdiction';

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
 * @param disclosureLedger  Mobile: MMKV-backed. Web: cloud DB-backed.
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

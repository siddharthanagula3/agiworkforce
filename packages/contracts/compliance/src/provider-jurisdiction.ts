
export type Jurisdiction = 'CN' | 'US' | 'GB' | 'FR' | 'DE' | 'OTHER';

export const CHINESE_HQ_PROVIDER_IDS = Object.freeze([
  'deepseek',
  'moonshot',
  'qwen',
  'zhipu',
] as const);

export type ChineseHqProviderId = (typeof CHINESE_HQ_PROVIDER_IDS)[number];

export function isChineseHqProvider(providerId: string): providerId is ChineseHqProviderId {
  return (CHINESE_HQ_PROVIDER_IDS as readonly string[]).includes(providerId);
}

export interface NamedProviderConsent {
  readonly providerId: string;
  readonly accepted: boolean;
  readonly acceptedAt: string;
  readonly disclosureVersion: string;
  readonly surface: 'mobile' | 'web' | 'desktop' | 'cli';
}

export interface ConsentLedger {
  getNamedProviderConsent(providerId: string): NamedProviderConsent | null;
}

/**
 * Returns whether routing to `providerId` is allowed for the current user.
 *
 * The contract:
 *   1. Providers NOT on the Chinese-HQ list are always allowed (other gates,
 *      like billing tier or API key presence, are enforced elsewhere).
 *   2. Chinese-HQ providers are allowed ONLY if the ledger has a matching
 *      `NamedProviderConsent` with `accepted === true`.
 *   3. A missing ledger entry is treated as deny — fail closed.
 *
 * @returns `true` if routing is permitted, `false` if blocked by R-023 gate.
 */
export function isProviderRoutingAllowed(providerId: string, ledger: ConsentLedger): boolean {
  if (!isChineseHqProvider(providerId)) return true;
  const consent = ledger.getNamedProviderConsent(providerId);
  return consent !== null && consent.accepted === true;
}

export function chineseHqProviderDisplayName(id: ChineseHqProviderId): string {
  switch (id) {
    case 'deepseek':
      return 'DeepSeek (China)';
    case 'moonshot':
      return 'Moonshot AI / Kimi (China)';
    case 'qwen':
      return 'Alibaba Qwen (China)';
    case 'zhipu':
      return 'Zhipu AI / GLM (China)';
  }
}

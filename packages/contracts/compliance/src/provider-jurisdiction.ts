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

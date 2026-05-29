/**
 * Provider jurisdiction registry — drives R-023 default-off gating.
 *
 * PRD V5 lock #26 + risk R-023 require that Chinese-HQ provider routing be
 * **default off** until the user opts in per-provider with named-provider
 * consent (Apple Guideline 5.1.2(i) + EU AI Act Article 50(1) named-provider
 * disclosure are combined into one consent flow).
 *
 * PRD V5 §10 #26 enumerates the four providers in scope: DeepSeek, Kimi /
 * Moonshot, Qwen, Zhipu. They map to the following provider IDs in
 * `packages/types/src/models.json`:
 *
 *   - deepseek           → DeepSeek (Hangzhou)
 *   - moonshot           → Moonshot AI / Kimi (Beijing)
 *   - qwen               → Alibaba Qwen (Hangzhou)
 *   - zhipu              → Zhipu AI (Beijing)
 *
 * Provider IDs are kept in sync with `packages/types/src/models.json` provider
 * keys; any rename there must be reflected here OR the integration test
 * `provider-jurisdiction.test.ts` will fail.
 */

/**
 * Canonical jurisdiction labels.
 * Two-letter ISO 3166-1 alpha-2 country codes.
 */
export type Jurisdiction = 'CN' | 'US' | 'GB' | 'FR' | 'DE' | 'OTHER';

/**
 * Frozen list of provider IDs whose corporate HQ is in China and which
 * therefore require explicit per-provider opt-in before any traffic is routed
 * to them. Matches PRD V5 §10 lock #26 exactly.
 */
export const CHINESE_HQ_PROVIDER_IDS = Object.freeze([
  'deepseek',
  'moonshot',
  'qwen',
  'zhipu',
] as const);

export type ChineseHqProviderId = (typeof CHINESE_HQ_PROVIDER_IDS)[number];

/**
 * Type guard. Lets callers narrow a raw provider string to the Chinese-HQ set
 * without importing the array directly.
 */
export function isChineseHqProvider(providerId: string): providerId is ChineseHqProviderId {
  return (CHINESE_HQ_PROVIDER_IDS as readonly string[]).includes(providerId);
}

/**
 * Per-provider opt-in ledger entry.
 *
 * One entry per (user, provider) tuple. Persisted by the host app — see
 * `apps/mobile/lib/mmkv.ts` for the mobile binding. Web persists to the managed
 * cloud database `consent_ledger` (PRD Appendix D §D.4 item 5: immutable
 * append-only).
 *
 * We deliberately store BOTH `acceptedAt` and `version`. The version field is
 * the SHA-256 of the consent copy shown at acceptance time, so that if the
 * disclosure text changes (e.g. provider added new model class), a new
 * acceptance is required.
 */
export interface NamedProviderConsent {
  /** Provider key from models.json (deepseek / moonshot / qwen / zhipu). */
  readonly providerId: string;
  /** Whether the user explicitly tapped "Enable [Provider]". */
  readonly accepted: boolean;
  /** Wall-clock ISO-8601 timestamp at acceptance. */
  readonly acceptedAt: string;
  /** SHA-256 of disclosure copy at acceptance — opaque correlation id. */
  readonly disclosureVersion: string;
  /** Where the consent was recorded (mobile / web / desktop). */
  readonly surface: 'mobile' | 'web' | 'desktop' | 'cli';
}

/**
 * Subset of consent ledger the gate needs to make a decision.
 * Decoupled from any specific persistence layer so this package stays
 * dependency-free (no MMKV, no cloud DB dependency).
 */
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

/**
 * Returns the human-readable display name for a Chinese-HQ provider. Mirrors
 * how the named-provider disclosure modal renders them so call sites stay in
 * sync.
 */
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

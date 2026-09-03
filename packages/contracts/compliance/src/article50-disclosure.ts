import {
  ARTICLE_50_1_VERBATIM,
  ARTICLE_50_2_VERBATIM,
  ARTICLE_50_PENALTY_TEXT,
  ARTICLE_50_SOURCE_URL,
} from './article50-text';
import {
  CHINESE_HQ_PROVIDER_IDS,
  chineseHqProviderDisplayName,
  type ChineseHqProviderId,
} from './provider-jurisdiction';

export const DISCLOSURE_LEDGER_KEY = 'agi:article50:first-run:v1' as const;

export interface DisclosureRecord {
  readonly version: 1;
  readonly acceptedAt: string;
  readonly surface: 'mobile' | 'web' | 'desktop' | 'cli';
  readonly disclosureCopyHash: string;
  readonly managedCloudAccepted: boolean;
  readonly chineseHqProvidersAccepted: readonly ChineseHqProviderId[];
}

export interface DisclosureInputs {
  readonly surface: DisclosureRecord['surface'];
  readonly offersManagedCloud: boolean;
  readonly thirdPartyAiProviders: readonly string[];
}

export interface DisclosureCopy {
  readonly title: string;
  readonly article50_1: string;
  readonly article50_2: string;
  readonly penaltyNotice: string;
  readonly sourceUrl: string;
  readonly summary: string;
  readonly acceptLabel: string;
  readonly declineLabel: string;
  readonly chineseHqProviderRows: ReadonlyArray<{
    readonly id: ChineseHqProviderId;
    readonly displayName: string;
    readonly defaultEnabled: false;
  }>;
}

export function composeFirstRunDisclosure(inputs: DisclosureInputs): DisclosureCopy {
  const providers = inputs.thirdPartyAiProviders.join(', ');
  const managedCloudSentence = inputs.offersManagedCloud
    ? `When you use AGI Managed Cloud, your prompts may be processed by the named third-party AI services you enable in this app, including with third-party AI: ${providers || '(none configured yet)'}. You can revoke this at any time in Settings.`
    : '';
  const shouldMentionProviderOptIn =
    inputs.offersManagedCloud || inputs.thirdPartyAiProviders.length > 0;
  const chineseHqSentence = shouldMentionProviderOptIn
    ? 'Providers headquartered in China (DeepSeek, Moonshot/Kimi, Qwen, Zhipu) are turned OFF by default. Toggle each one on below if you want to route conversations through them.'
    : '';

  const summary = [
    'You are interacting with an AI system.',
    'Responses can be inaccurate. Review important output before using it.',
    'AI-generated text, audio, image, or video is marked when you export or share it.',
    managedCloudSentence,
    chineseHqSentence,
  ]
    .filter((line) => line.length > 0)
    .join('\n\n');

  return {
    title: 'Before you start',
    article50_1: ARTICLE_50_1_VERBATIM,
    article50_2: ARTICLE_50_2_VERBATIM,
    penaltyNotice: ARTICLE_50_PENALTY_TEXT,
    sourceUrl: ARTICLE_50_SOURCE_URL,
    summary,
    acceptLabel: 'I understand, continue',
    declineLabel: 'Not now',
    chineseHqProviderRows: CHINESE_HQ_PROVIDER_IDS.map((id) => ({
      id,
      displayName: chineseHqProviderDisplayName(id),
      defaultEnabled: false as const,
    })),
  };
}

export interface DisclosureLedger {
  read(): DisclosureRecord | null;
  write(record: DisclosureRecord): void;
}

export function isDisclosureSatisfied(
  ledger: DisclosureLedger,
  requireManagedCloud: boolean,
): boolean {
  const record = ledger.read();
  if (record === null) return false;
  if (record.version !== 1) return false;
  if (requireManagedCloud && !record.managedCloudAccepted) return false;
  return true;
}

export async function hashDisclosureCopy(copy: DisclosureCopy): Promise<string> {
  const canonical = JSON.stringify({
    t: copy.title,
    s: copy.summary,
    p: copy.penaltyNotice,
    a1: copy.article50_1,
    a2: copy.article50_2,
  });

  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (subtle) {
    const bytes = new TextEncoder().encode(canonical);
    const digest = await subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  let h1 = 0xcbf29ce4;
  let h2 = 0x84222325;
  for (let i = 0; i < canonical.length; i++) {
    const ch = canonical.charCodeAt(i);
    h1 = (h1 ^ ch) >>> 0;
    h2 = (h2 ^ ch) >>> 0;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = Math.imul(h2, 0x01000195) >>> 0;
  }
  return `fnv-${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export async function recordDisclosureAcceptance(args: {
  ledger: DisclosureLedger;
  copy: DisclosureCopy;
  surface: DisclosureRecord['surface'];
  managedCloudAccepted: boolean;
  chineseHqProvidersAccepted: readonly ChineseHqProviderId[];
  now?: () => Date;
}): Promise<DisclosureRecord> {
  const { ledger, copy, surface, managedCloudAccepted, chineseHqProvidersAccepted } = args;
  const now = args.now ?? (() => new Date());

  const record: DisclosureRecord = {
    version: 1,
    acceptedAt: now().toISOString(),
    surface,
    disclosureCopyHash: await hashDisclosureCopy(copy),
    managedCloudAccepted,
    chineseHqProvidersAccepted: Object.freeze([...chineseHqProvidersAccepted]),
  };
  ledger.write(record);
  return record;
}

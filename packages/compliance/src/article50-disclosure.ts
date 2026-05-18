/**
 * Article50Disclosure — the "you are interacting with AI" first-run gate.
 *
 * PRD V5 §10 lock #26 ground truth:
 *
 *   > Article 50(1) "you are interacting with AI" first-run disclosure
 *   > (covers V4's Apple 5.1.2(i) consent flow + adds explicit chatbot label).
 *   > [...]
 *   > Enforcer: `packages/compliance/src/article50.ts` runs in onboarding
 *   > flow before first AI request.
 *
 * The lock is explicit that the Article 50(1) disclosure and the Apple
 * 5.1.2(i) consent modal are **combined into a single screen** so users don't
 * get double-prompted. That's why this module exports:
 *
 *   - `DisclosureRecord` — what we persist
 *   - `composeFirstRunDisclosure()` — returns the merged copy block for the
 *     single combined consent screen (chat label + 5.1.2(i) named-provider
 *     consent + Chinese-HQ default-off note)
 *   - `recordDisclosureAcceptance()` — appends to the consent ledger
 *   - `isDisclosureSatisfied()` — gate that the LLM HTTP client checks
 *     before issuing the first `/api/llm/*` request
 *
 * The actual React Native / web modal lives in the host app — this package
 * intentionally ships no UI code. The copy is exported as plain strings so
 * the mobile + web + desktop surfaces can render with their own design tokens.
 *
 * Verbatim Article 50(1) text:
 *   "Providers shall ensure that AI systems intended to interact directly
 *    with natural persons are designed and developed in such a way that the
 *    natural persons concerned are informed that they are interacting with
 *    an AI system [...]"
 *   — Regulation (EU) 2024/1689, Article 50(1).
 */

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

/** Storage key used by both mobile (MMKV) and web (localStorage / Supabase). */
export const DISCLOSURE_LEDGER_KEY = 'agi:article50:first-run:v1' as const;

/**
 * Record persisted to the consent ledger once the user dismisses the
 * combined disclosure + 5.1.2(i) modal. The shape is consumed by:
 *   - Supabase `consent_ledger` table writer (web)
 *   - `apps/mobile/lib/mmkv.ts` (mobile)
 *   - Desktop SQLite store (later)
 */
export interface DisclosureRecord {
  /** Schema version. Bump if `composeFirstRunDisclosure()` materially changes. */
  readonly version: 1;
  /** ISO-8601 timestamp of acceptance. */
  readonly acceptedAt: string;
  /** Where the disclosure was accepted. */
  readonly surface: 'mobile' | 'web' | 'desktop' | 'cli';
  /** SHA-256 of the exact copy shown — opaque correlation id. */
  readonly disclosureCopyHash: string;
  /**
   * Whether the user explicitly opted in to managed-cloud routing (i.e.
   * Apple 5.1.2(i) named-provider consent). Defaults to true when the
   * disclosure runs in BYOK-only mode (no managed routing on the surface).
   */
  readonly managedCloudAccepted: boolean;
  /**
   * Subset of Chinese-HQ providers the user enabled at the disclosure step.
   * **Default is empty** — Chinese-HQ providers are opt-in per #26 / R-023.
   * Empty array means: all Chinese-HQ providers stay disabled.
   */
  readonly chineseHqProvidersAccepted: readonly ChineseHqProviderId[];
}

/**
 * Inputs the disclosure composition needs from the host app, so this package
 * does not have to know about every surface's routing model.
 */
export interface DisclosureInputs {
  /** "mobile" | "web" | "desktop" | "cli". Drives the rendered surface label. */
  readonly surface: DisclosureRecord['surface'];
  /**
   * Whether the surface offers managed-cloud routing. When true, the merged
   * copy block includes the verbatim Apple 5.1.2(i) named-provider sentence.
   */
  readonly offersManagedCloud: boolean;
  /**
   * Named third-party AI providers the surface may route to (mobile = list
   * coming from `models.json`, BYOK keys, etc.).
   * Required by Apple 5.1.2(i) which mandates enumeration of every third
   * party that processes the user's content.
   */
  readonly thirdPartyAiProviders: readonly string[];
}

/**
 * Composes the merged disclosure copy for the single combined consent screen.
 *
 * Returns plain strings (no JSX, no markdown rendering) so each surface can
 * render with its own typography / accessibility scaffolding.
 */
export interface DisclosureCopy {
  /** Screen title — used as accessibility label + visible heading. */
  readonly title: string;
  /** Verbatim Article 50(1) block. Display under a "Why we show this" toggle. */
  readonly article50_1: string;
  /** Verbatim Article 50(2) block. Display under the same toggle. */
  readonly article50_2: string;
  /** Penalty exposure copy — visible to reviewers. */
  readonly penaltyNotice: string;
  /** Source link. */
  readonly sourceUrl: string;
  /**
   * Plain-language summary the user actually reads. Combines the chatbot
   * label (50(1)), the Apple 5.1.2(i) named-provider enumeration (when
   * applicable), and the Chinese-HQ default-off note. ONE block — not three.
   */
  readonly summary: string;
  /** Button label on the accept button. */
  readonly acceptLabel: string;
  /** Button label on the decline button. */
  readonly declineLabel: string;
  /**
   * Per-provider opt-in rows the surface must render. Each row is one
   * Chinese-HQ provider; row state is controlled by the user and recorded
   * into `DisclosureRecord.chineseHqProvidersAccepted`.
   */
  readonly chineseHqProviderRows: ReadonlyArray<{
    readonly id: ChineseHqProviderId;
    readonly displayName: string;
    readonly defaultEnabled: false;
  }>;
}

/**
 * Builds the single combined disclosure copy block. Pure function — no I/O.
 *
 * Why one block, not three: PRD V5 lock #26 is explicit ("covers V4's Apple
 * 5.1.2(i) consent flow") and the team-lead instructions ("combinable with
 * 5.1.2(i) modal so we don't double-prompt") are explicit. Three separate
 * consent prompts is exactly the dark pattern Article 4 (manipulation
 * prohibitions, active 2026-02-02) warns against AND increases drop-off in
 * onboarding without satisfying any additional legal requirement.
 */
export function composeFirstRunDisclosure(inputs: DisclosureInputs): DisclosureCopy {
  const providers = inputs.thirdPartyAiProviders.join(', ');
  const managedCloudSentence = inputs.offersManagedCloud
    ? `When you use AGI Managed Cloud, your prompts may be processed by the named third-party AI services you enable in this app, including with third-party AI: ${providers || '(none configured yet)'}. You can revoke this at any time in Settings.`
    : '';
  const chineseHqSentence =
    'Providers headquartered in China (DeepSeek, Moonshot/Kimi, Qwen, Zhipu) are turned OFF by default. Toggle each one on below if you want to route conversations through them.';

  const summary = [
    'You are interacting with an AI system.',
    'Responses may be inaccurate or fabricated. Treat them as suggestions, not professional advice.',
    'Outputs of AI-generated text, audio, image, or video are marked as machine-generated when you export or share them.',
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
    acceptLabel: 'I understand — continue',
    declineLabel: 'Not now',
    chineseHqProviderRows: CHINESE_HQ_PROVIDER_IDS.map((id) => ({
      id,
      displayName: chineseHqProviderDisplayName(id),
      defaultEnabled: false as const,
    })),
  };
}

/**
 * Minimal ledger interface — abstracts MMKV / localStorage / Supabase / SQLite.
 * Host app provides the concrete implementation.
 */
export interface DisclosureLedger {
  read(): DisclosureRecord | null;
  write(record: DisclosureRecord): void;
}

/**
 * The gate the LLM HTTP client checks before issuing the first request.
 *
 * Returns true iff:
 *   - the ledger has a record AND
 *   - the record schema version matches (else we re-prompt) AND
 *   - the user accepted managed-cloud routing if the surface uses it.
 *
 * The Chinese-HQ provider list is NOT part of this gate — that check lives
 * in `isProviderRoutingAllowed()` (provider-jurisdiction.ts). The summary
 * disclosure can be accepted with zero Chinese-HQ providers enabled.
 */
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

/**
 * Returns a SHA-256 hex digest of the disclosure copy. Used to detect when
 * the displayed copy has changed and a re-prompt is required.
 *
 * Lives in this package (not @agiworkforce/utils) because the only call
 * sites are the disclosure write path + the ledger schema-check test. We use
 * a tiny inline polyfill chain so this stays dependency-free.
 */
export async function hashDisclosureCopy(copy: DisclosureCopy): Promise<string> {
  const canonical = JSON.stringify({
    t: copy.title,
    s: copy.summary,
    p: copy.penaltyNotice,
    a1: copy.article50_1,
    a2: copy.article50_2,
  });

  // Prefer Web Crypto when available (RN 0.84 + Hermes ship globalThis.crypto.subtle
  // via expo-crypto polyfill, and Node 20+ exposes it natively).
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (subtle) {
    const bytes = new TextEncoder().encode(canonical);
    const digest = await subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Fallback for environments without Web Crypto (older RN runtimes when
  // expo-crypto's polyfill hasn't loaded yet). FNV-1a 64-bit is NOT
  // cryptographic — it is fine here because the hash is an opaque
  // change-detector, not a security primitive.
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

/**
 * Convenience: builds a `DisclosureRecord` from user input and the rendered
 * copy, then writes it. Host app calls this from the modal's accept handler.
 */
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

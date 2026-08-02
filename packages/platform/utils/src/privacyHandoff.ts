import type {
  DeveloperSessionSurface,
  HandoffContextItem,
  HandoffDraft,
  RedactionReport,
  SecretScanFinding,
  SyncedAppSurface,
} from '@agiworkforce/types';
import { sha256 } from './crypto';
import { redactSecretsWithReport } from './logger';

const SCANNER_VERSION = 'agi-utils/privacy-handoff@1';
const encoder = new TextEncoder();

export interface HandoffPreviewContextItem extends HandoffContextItem {
  /**
   * Text rendered in the payload preview and passed through the secret scanner.
   * Binary callers may provide a bounded descriptor here while binding the
   * exact source bytes through the inherited `byteCount` + `checksumSha256`.
   */
  content: string;
}

export interface RedactedHandoffContextItem extends HandoffContextItem {
  redactedContent: string;
}

/**
 * Where the selected context is going. The pair is carried into the hashed
 * payload AND the draft, so it is part of what the user's consent attests to —
 * a preview hash that names the wrong destination is worse than no hash.
 *
 * `byok` is the default because that was this builder's only target when it was
 * written; Managed Cloud reuses the identical ceremony with a different label.
 */
export type HandoffTarget = 'byok' | 'managed';

const HANDOFF_TARGETS = {
  byok: { targetPrivacyMode: 'byok', targetProviderMode: 'DirectByok' },
  managed: { targetPrivacyMode: 'managed', targetProviderMode: 'ManagedGateway' },
} as const;

export interface BuildLocalToByokHandoffDraftParams {
  sourceSessionId: string;
  sourceSurface: DeveloperSessionSurface | SyncedAppSurface;
  targetSurface: SyncedAppSurface;
  /** Defaults to `'byok'`, preserving every existing caller's behaviour. */
  target?: HandoffTarget;
  selectedContext: HandoffPreviewContextItem[];
  createdAt?: string;
  expiresAt: string;
  blockOnFindings?: boolean;
  hash?: (value: string) => Promise<string>;
}

export interface LocalToByokHandoffPreview {
  draft: HandoffDraft;
  redactedPayload: string;
  redactedContext: RedactedHandoffContextItem[];
  redactionReport: RedactionReport;
}

function byteCount(value: string): number {
  return encoder.encode(value).byteLength;
}

const SHA_256_HEX = /^[a-f0-9]{64}$/;

function validateSourceEvidence(item: HandoffPreviewContextItem): void {
  const hasByteCount = item.byteCount !== undefined;
  const hasChecksum = item.checksumSha256 !== undefined;
  if (hasByteCount !== hasChecksum) {
    throw new Error(
      `Handoff context ${item.id} must provide byteCount and checksumSha256 together.`,
    );
  }
}

function sourceByteCount(item: HandoffPreviewContextItem, redactedContent: string): number {
  if (item.byteCount === undefined) return byteCount(redactedContent);
  if (!Number.isSafeInteger(item.byteCount) || item.byteCount < 0) {
    throw new Error(`Invalid byte count for handoff context ${item.id}.`);
  }
  return item.byteCount;
}

async function sourceChecksum(
  item: HandoffPreviewContextItem,
  redactedContent: string,
  hash: (value: string) => Promise<string>,
): Promise<string> {
  if (item.checksumSha256 === undefined) return hash(redactedContent);
  if (!SHA_256_HEX.test(item.checksumSha256)) {
    throw new Error(`Invalid SHA-256 checksum for handoff context ${item.id}.`);
  }
  return item.checksumSha256;
}

function mergeFindings(findings: SecretScanFinding[][]): SecretScanFinding[] {
  return findings.flat().map((finding, index) => ({
    ...finding,
    id: `${finding.ruleId}-${String(index + 1).padStart(3, '0')}`,
  }));
}

export async function buildLocalToByokHandoffDraft(
  params: BuildLocalToByokHandoffDraftParams,
): Promise<LocalToByokHandoffPreview> {
  const createdAt = params.createdAt ?? new Date().toISOString();
  const hash = params.hash ?? sha256;
  params.selectedContext.forEach(validateSourceEvidence);
  const redactionResults = params.selectedContext.map((item) =>
    redactSecretsWithReport(item.content, { location: item.sourceUri ?? item.label }),
  );
  const findings = mergeFindings(redactionResults.map((result) => result.findings));
  const redactedContext = await Promise.all(
    params.selectedContext.map(async (item, index): Promise<RedactedHandoffContextItem> => {
      const redactedContent = redactionResults[index]?.redactedText ?? '';

      return {
        id: item.id,
        kind: item.kind,
        label: item.label,
        sourceUri: item.sourceUri,
        // Callers transferring non-text bytes can bind the preview to the
        // immutable source object by supplying its byte count and checksum.
        // Text-only callers retain the original redacted-content evidence.
        byteCount: sourceByteCount(item, redactedContent),
        checksumSha256: await sourceChecksum(item, redactedContent, hash),
        redactedContent,
      };
    }),
  );

  const resolvedTarget = HANDOFF_TARGETS[params.target ?? 'byok'];
  const redactedPayload = JSON.stringify(
    {
      sourceSessionId: params.sourceSessionId,
      sourceSurface: params.sourceSurface,
      targetSurface: params.targetSurface,
      targetPrivacyMode: resolvedTarget.targetPrivacyMode,
      targetProviderMode: resolvedTarget.targetProviderMode,
      selectedContext: redactedContext.map((item) => ({
        id: item.id,
        kind: item.kind,
        label: item.label,
        sourceUri: item.sourceUri,
        byteCount: item.byteCount,
        checksumSha256: item.checksumSha256,
        content: item.redactedContent,
      })),
    },
    null,
    2,
  );
  const previewHashSha256 = await hash(redactedPayload);
  const redactionReport: RedactionReport = {
    scannerVersion: SCANNER_VERSION,
    findings,
    redactedByteCount: redactionResults.reduce(
      (total, result) => total + result.redactedByteCount,
      0,
    ),
    blocked: (params.blockOnFindings ?? true) && findings.length > 0,
    generatedAt: createdAt,
  };

  const draft: HandoffDraft = {
    id: `handoff-${previewHashSha256.slice(0, 16)}`,
    sourceSessionId: params.sourceSessionId,
    sourceSurface: params.sourceSurface,
    targetSurface: params.targetSurface,
    targetPrivacyMode: resolvedTarget.targetPrivacyMode,
    targetProviderMode: resolvedTarget.targetProviderMode,
    selectedContext: redactedContext.map(({ redactedContent: _redactedContent, ...item }) => item),
    redactionReport,
    previewHashSha256,
    consentRequired: true,
    expiresAt: params.expiresAt,
    createdAt,
  };

  return { draft, redactedPayload, redactedContext, redactionReport };
}

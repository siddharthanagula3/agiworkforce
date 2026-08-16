
export type SyntheticContentKind = 'image' | 'video';

export const AI_ACCURACY_DISCLAIMER = 'AGI can make mistakes. Check important info.';

export const AI_GENERATED_HEADER = 'x-agi-ai-generated';

export const AI_GENERATED_PROVENANCE_HEADER = 'x-agi-ai-provenance';

export interface AiGeneratedProvenance {
  readonly version: 1;
  readonly claim_generator: string;
  readonly kind: SyntheticContentKind;
  readonly generated_at: string;
  readonly provider: string;
  readonly model: string;
  readonly content_hash_sha256: string;
  readonly assertions: ReadonlyArray<{ readonly label: string; readonly action: string }>;
  readonly signature: string | null;
}

export function buildAiGeneratedProvenance(args: {
  kind: SyntheticContentKind;
  provider: string;
  model: string;
  contentHashSha256?: string;
  generatedAt?: string;
}): AiGeneratedProvenance {
  return {
    version: 1,
    claim_generator: 'AGI',
    kind: args.kind,
    generated_at: args.generatedAt ?? new Date().toISOString(),
    provider: args.provider,
    model: args.model,
    content_hash_sha256: args.contentHashSha256 ?? '',
    assertions: [
      {
        label: 'c2pa.actions',
        action: 'c2pa.created:trainedAlgorithmicMedia',
      },
    ],
    signature: null,
  };
}

export function serialiseProvenance(claim: AiGeneratedProvenance): string {
  return JSON.stringify(claim, (_key, value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
}

export function aiGeneratedHeaders(claim?: AiGeneratedProvenance): Record<string, string> {
  if (!claim) return { [AI_GENERATED_HEADER]: 'true' };
  return {
    [AI_GENERATED_HEADER]: 'true',
    [AI_GENERATED_PROVENANCE_HEADER]: serialiseProvenance(claim),
  };
}

export function hasAiGeneratedProvenance(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const claim = value as Partial<AiGeneratedProvenance>;
  if (claim.version !== 1) return false;
  if (typeof claim.model !== 'string' || claim.model.length === 0) return false;
  return (
    Array.isArray(claim.assertions) &&
    claim.assertions.some((a) => a?.action === 'c2pa.created:trainedAlgorithmicMedia')
  );
}

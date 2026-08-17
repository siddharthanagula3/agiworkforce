export type SyntheticContentKind = 'text' | 'audio' | 'image' | 'video';

export const AI_ACT_CREATED_ASSERTION = 'c2pa.created:trainedAlgorithmicMedia';

export const AI_ACT_ACTIONS_LABEL = 'c2pa.actions';

export const AI_ACT_CLAIM_GENERATOR = 'AGI';

export interface AiActProvenanceAssertion {
  readonly label: string;
  readonly action: string;
}

export interface AiActProvenanceClaim {
  readonly version: 1;
  readonly claim_generator: string;
  readonly kind: SyntheticContentKind;
  readonly generated_at: string;
  readonly provider: string;
  readonly model: string;
  readonly content_hash_sha256: string;
  readonly assertions: ReadonlyArray<AiActProvenanceAssertion>;
  readonly signature: string | null;
}

export function buildAiActProvenanceClaim(args: {
  kind: SyntheticContentKind;
  provider: string;
  model: string;
  contentHashSha256?: string;
  generatedAt?: string;
  claimGenerator?: string;
}): AiActProvenanceClaim {
  return {
    version: 1,
    claim_generator: args.claimGenerator ?? AI_ACT_CLAIM_GENERATOR,
    kind: args.kind,
    generated_at: args.generatedAt ?? new Date().toISOString(),
    provider: args.provider,
    model: args.model,
    content_hash_sha256: args.contentHashSha256 ?? '',
    assertions: Object.freeze([
      Object.freeze({ label: AI_ACT_ACTIONS_LABEL, action: AI_ACT_CREATED_ASSERTION }),
    ]),
    signature: null,
  };
}

export function serialiseAiActProvenanceClaim(claim: AiActProvenanceClaim): string {
  return JSON.stringify(claim, (_key, value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
}

export function hasAiActProvenanceClaim(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const claim = value as Partial<AiActProvenanceClaim>;
  if (claim.version !== 1) return false;
  if (typeof claim.model !== 'string' || claim.model.length === 0) return false;
  return (
    Array.isArray(claim.assertions) &&
    claim.assertions.some((assertion) => assertion?.action === AI_ACT_CREATED_ASSERTION)
  );
}

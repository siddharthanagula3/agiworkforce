import {
  buildAiActProvenanceClaim,
  hasAiActProvenanceClaim,
  serialiseAiActProvenanceClaim,
  type AiActProvenanceClaim,
  type SyntheticContentKind as AiActSyntheticContentKind,
} from '@agiworkforce/types';

export type SyntheticContentKind = Extract<AiActSyntheticContentKind, 'image' | 'video'>;

/**
 * Article 50(1) requires telling a natural person they are interacting with an
 * AI system "unless this is obvious from the point of view of a reasonably
 * well-informed [...] natural person". The web composer dropped its explicit
 * sentence on 2026-08-14 in reliance on that carve-out. No counsel has signed
 * off on that reading, so it is recorded here as an open legal position rather
 * than as compliance. `AI_ACCURACY_DISCLAIMER` stayed under the composer until
 * 2026-09-05, when the founder removed the line from the product; the constant
 * remains so tests can assert its absence and so a future onboarding or
 * settings disclosure can reuse the wording. Counsel has not reviewed either
 * step.
 */
export const ARTICLE_50_1_WEB_CARVE_OUT = Object.freeze({
  reliedOn: true,
  since: '2026-08-14',
  basis: 'Article 50(1) obviousness carve-out, Regulation (EU) 2024/1689',
  counselReviewed: false,
});

/**
 * Article 50(2) coverage on web, per synthetic kind. A kind is either marked
 * server-side on the response that carries the artefact, or it is a recorded
 * gap with a stated reason, never silently absent.
 */
export const ARTICLE_50_2_WEB_SCOPE: Readonly<
  Record<AiActSyntheticContentKind, { readonly marked: boolean; readonly basis: string }>
> = Object.freeze({
  image: Object.freeze({
    marked: true,
    basis: 'Marked by /api/media/image/generate and re-emitted by /api/files/[id].',
  }),
  video: Object.freeze({
    marked: true,
    basis: 'Marked by /api/media/video/status and re-emitted by /api/files/[id].',
  }),
  text: Object.freeze({
    marked: false,
    basis: 'OPEN GAP: streamed chat text carries no machine-readable mark on any surface.',
  }),
  audio: Object.freeze({
    marked: false,
    basis: 'OPEN GAP: web ships no audio-generation route, so nothing is produced to mark.',
  }),
});

export const AI_ACCURACY_DISCLAIMER = 'AGI can make mistakes. Check important info.';

export const AI_GENERATED_HEADER = 'x-agi-ai-generated';

export const AI_GENERATED_PROVENANCE_HEADER = 'x-agi-ai-provenance';

export type AiGeneratedProvenance = AiActProvenanceClaim;

export function buildAiGeneratedProvenance(args: {
  kind: SyntheticContentKind;
  provider: string;
  model: string;
  contentHashSha256?: string;
  generatedAt?: string;
}): AiGeneratedProvenance {
  return buildAiActProvenanceClaim(args);
}

export const serialiseProvenance = serialiseAiActProvenanceClaim;

export const hasAiGeneratedProvenance = hasAiActProvenanceClaim;

export function aiGeneratedHeaders(claim?: AiGeneratedProvenance): Record<string, string> {
  if (!claim) return { [AI_GENERATED_HEADER]: 'true' };
  return {
    [AI_GENERATED_HEADER]: 'true',
    [AI_GENERATED_PROVENANCE_HEADER]: serialiseProvenance(claim),
  };
}

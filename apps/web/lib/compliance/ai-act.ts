/**
 * EU AI Act Article 50 transparency primitives for the web app.
 *
 * Applicable to us since 2026-08-02 (Regulation (EU) 2024/1689), and we have
 * served EU users since 2026-06-27. Two obligations land on this surface:
 *
 *   - Article 50(1) — a natural person must be informed that they are
 *     interacting with an AI system, UNLESS that is obvious from the context.
 *     As of 2026-08-14 this surface relies on that carve-out and renders no
 *     explicit disclosure sentence; see `AI_ACCURACY_DISCLAIMER` below for the
 *     reasoning and for what deliberately stayed.
 *   - Article 50(2) — synthetic output must be "marked in a machine-readable
 *     format and detectable as artificially generated".
 *     `buildAiGeneratedProvenance` is that mark. Only the two web surfaces that
 *     actually produce synthetic artefacts are covered here: generated images
 *     and generated video. Streamed chat text is NOT marked on any surface and
 *     there is no web audio-generation route — both are open gaps, not
 *     something this module quietly handles.
 *
 * The mark is produced SERVER-SIDE, on the response that carries the artefact,
 * and persisted alongside the asset so the authenticated byte route
 * (`/api/files/[id]`) can re-emit it on every later download. A client-rendered
 * badge is not a marker: it disappears the moment the bytes leave the product,
 * which is exactly the case Article 50(2) is written for.
 *
 * Field names mirror `@agiworkforce/compliance`
 * (`packages/contracts/compliance/src/article50-marker.ts`), which mobile
 * ships — same C2PA-2.1 field names, same claim shape — so the two surfaces are
 * wire-compatible by type. They are NOT interoperable in practice today: that
 * package's `serialiseClaim` passes an array replacer to `JSON.stringify`,
 * which is a key allowlist applied at every depth, so mobile's emitted sidecar
 * serialises `assertions` as `[{}]` and `hasAiGeneratedProvenance` below would
 * reject mobile's own output. Fixing that lives with the package owner.
 *
 * This module restates the shape rather than importing it because
 * `@agiworkforce/compliance` is not a declared dependency of
 * `@agiworkforce/web`; adding one is a manifest + lockfile change that has to
 * land on its own.
 */

/**
 * Content kinds we mark. Art. 50(2) also covers text and audio; those members
 * are deliberately absent because no web route produces either as synthetic
 * output today, and an unconstructible member reads as coverage we do not have.
 */
export type SyntheticContentKind = 'image' | 'video';

/**
 * The composer's one-line caveat.
 *
 * CHANGED 2026-08-14 (founder decision). This previously read "You are
 * interacting with an AI system. AGI can make mistakes. Check important info."
 * The first sentence — the explicit Article 50(1) disclosure — has been removed.
 * The reasoning, recorded because this is a legal position and not a copy tweak:
 *
 *   Article 50(1) does not apply where the fact of interacting with an AI is
 *   "obvious from the point of view of a natural person who is reasonably
 *   well-informed, observant and circumspect, taking into account the
 *   circumstances and the context of use". The position taken here is that a
 *   product presented end-to-end as an AI assistant, entered through a model
 *   picker and a mode selector that names the inference route, falls inside that
 *   carve-out. It is the same position ChatGPT and Claude visibly take — neither
 *   renders an equivalent sentence.
 *
 * WHAT WAS NOT REMOVED, and why, so this does not get trimmed further by
 * someone reading only the diff:
 *
 *   - "AGI can make mistakes. Check important info." STAYS. ChatGPT and Claude
 *     both show an accuracy caveat in exactly this position; removing it would
 *     make this product disclose LESS than the comparators cited for the change,
 *     which is the opposite of the intent.
 *   - The Managed cloud / mode pill next to it STAYS. It is the trust-boundary
 *     control, not decoration — the product's core promise is that you see the
 *     route before anything leaves your device.
 *   - The Privacy link STAYS. It and one link in Settings are the ONLY in-app
 *     routes to the privacy notice; the signed-in app shell renders no legal
 *     footer at all. Removing it would leave the notice effectively unreachable
 *     from inside the product, which cuts against the DPDP notice obligation.
 *
 * The carve-out argument above has NOT been reviewed by counsel. It is tracked
 * with the rest of the unreviewed legal positions in DPDP_PROGRESS.md. Note also
 * that signup terms acceptance does not discharge Article 50(1): that is consent
 * to a contract, whereas 50(1) is a transparency duty at the point of
 * interaction. The carve-out is the argument that works; terms acceptance is not.
 *
 * Mobile is unaffected. It carries its own disclosure through
 * `@agiworkforce/compliance` and a dedicated /legal/article-50 screen, on a
 * surface with app-store review considerations this decision did not weigh.
 */
export const AI_ACCURACY_DISCLAIMER = 'AGI can make mistakes. Check important info.';

/**
 * Response header set on every payload that carries synthetic media, so a
 * proxy, a download manager or an automated verifier can detect the artefact
 * as AI-generated without parsing the body.
 */
export const AI_GENERATED_HEADER = 'x-agi-ai-generated';

/** Header carrying the serialised provenance claim (single-artefact responses). */
export const AI_GENERATED_PROVENANCE_HEADER = 'x-agi-ai-provenance';

/**
 * C2PA-style provenance claim. Field names track C2PA 2.1 so downstream
 * verifiers and a future signing service interoperate.
 *
 * `signature` is null until a signing service attaches a JWS. An unsigned
 * claim still satisfies "detectable as artificially generated"; it is simply
 * self-attested rather than cryptographically attributable.
 */
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
    // Empty when the bytes never materialise server-side (a provider-hosted
    // video URL). The provider + model + timestamp triple still marks it.
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

/**
 * Stable serialisation — keys sorted at every depth so the same logical claim
 * always produces the same bytes, which is what a JWS signature will be taken
 * over once a signing service exists.
 *
 * A replacer FUNCTION, not `JSON.stringify(claim, Object.keys(claim).sort())`:
 * the array form is a key allowlist that applies at every depth, so the
 * assertion objects — whose keys are not top-level claim keys — serialise as
 * `{}` and the marker loses the very field that identifies it as AI-generated.
 */
export function serialiseProvenance(claim: AiGeneratedProvenance): string {
  return JSON.stringify(claim, (_key, value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  );
}

/**
 * Headers to spread onto a response that carries synthetic media. Pass the
 * claim when the response describes exactly one artefact; omit it when the
 * response carries several and the claims travel in the body.
 */
export function aiGeneratedHeaders(claim?: AiGeneratedProvenance): Record<string, string> {
  if (!claim) return { [AI_GENERATED_HEADER]: 'true' };
  return {
    [AI_GENERATED_HEADER]: 'true',
    [AI_GENERATED_PROVENANCE_HEADER]: serialiseProvenance(claim),
  };
}

/**
 * Detector — true when a value is an AGI-issued Article 50(2) marker. This is
 * the shape a third party has to be able to recognise for the mark to count as
 * "machine-readable".
 *
 * Production caller: `/api/files/[id]` runs a persisted `metadata.aiAct` blob
 * through this before re-emitting it as a response header, so a row whose
 * metadata was written by some other pipeline (or by an older claim shape)
 * fails closed and serves no marker rather than a malformed one.
 */
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

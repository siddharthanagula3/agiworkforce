/**
 * Article50Marker — machine-readable marking on every AI-generated export.
 *
 * PRD V5 §10 lock #26 ground truth (verbatim):
 *
 *   > Article 50(2) machine-readable marking on AI-generated text / audio /
 *   > image exports (C2PA-style provenance claims OR invisible token-level
 *   > watermarking via provider hooks). [...]
 *   > Enforcer: [...] integration test asserts `<meta name="agi:ai-generated"`
 *   > tag on every export.
 *
 * Verbatim Article 50(2):
 *   "Providers of AI systems, including general-purpose AI systems,
 *    generating synthetic audio, image, video or text content, shall ensure
 *    that the outputs of the AI system are marked in a machine-readable
 *    format and detectable as artificially generated or manipulated. [...]"
 *   — Regulation (EU) 2024/1689, Article 50(2).
 *
 * This module produces TWO marker artefacts. The export path SHOULD attach
 * both — they are interoperable, not exclusive:
 *
 *   1. A C2PA-style provenance claim (JSON object) suitable for embedding
 *      in JUMBF (image / audio / video) or appending as a sidecar / inline
 *      JSON for text artefacts. Mirrors the C2PA 2.1 schema field names
 *      ("claim_generator", "assertions", "ingredients") so downstream
 *      verifiers built against C2PA work out of the box.
 *
 *   2. A `<meta name="agi:ai-generated" ...>` HTML tag for text exports
 *      that render as HTML (web share preview, mobile sharesheet HTML
 *      payload, etc). This is the exact tag name the integration test
 *      grep-asserts.
 *
 * Why both: text exports often round-trip through systems that strip JUMBF
 * but preserve HTML <meta>. Image / audio / video exports often round-trip
 * through systems that preserve JUMBF but never had HTML. Defence in depth.
 *
 * Why we don't ship cryptographic signing in this package: signing requires
 * a key custody story (HSM in production; secure-enclave on device). That
 * is a service-tier concern, not a "first MVP marker" concern. The claim
 * object exposes a `signature: null` placeholder + a `signedClaim` helper
 * type so the signing service can attach a JWS later without breaking
 * downstream verifiers.
 */

/** Content kinds we mark. Mirrors the four content types listed in Art. 50(2). */
export type SyntheticContentKind = 'text' | 'audio' | 'image' | 'video';

/**
 * C2PA-style provenance claim. Schema field names track C2PA 2.1 so that
 * downstream verifiers and signing services interoperate.
 *
 * Reference: C2PA Technical Specification 2.1
 * (https://c2pa.org/specifications/specifications/2.1/specs/_attachments/C2PA_Specification.pdf)
 *
 * We intentionally keep this small — only the fields required to mark an
 * AGI-produced artefact as artificially generated under Article 50(2). A
 * complete C2PA manifest with ingredients, training-mining assertion, and
 * device origin can be layered on later without breaking the schema.
 */
export interface C2paStyleClaim {
  /** Always 1 — bump when the claim shape materially changes. */
  readonly version: 1;
  /** Application identity. Always "AGI/<version>" — surfaces as "claim_generator". */
  readonly claim_generator: string;
  /** Content type — text / audio / image / video. */
  readonly kind: SyntheticContentKind;
  /** ISO-8601 UTC timestamp of generation. */
  readonly generated_at: string;
  /** Provider that produced the artefact (anthropic / openai / google / ...). */
  readonly provider: string;
  /** Model identifier resolved from the canonical model catalog. */
  readonly model: string;
  /** SHA-256 of the artefact bytes (hex). Empty string when payload not hashable. */
  readonly content_hash_sha256: string;
  /**
   * Assertion list — at minimum the AI-generated marker (`c2pa.created`)
   * with a hard-coded "ai-generated" action. Mirrors C2PA `actions` assertion.
   */
  readonly assertions: ReadonlyArray<{
    readonly label: string;
    readonly action: string;
  }>;
  /**
   * JWS signature placeholder. Populated by the signing service post-hoc.
   * `null` here is valid — verifiers SHOULD treat unsigned claims as
   * "self-attested" (still detects as artificially generated per 50(2);
   * not cryptographically attributable to AGI yet).
   */
  readonly signature: string | null;
}

/**
 * Builds a C2PA-style provenance claim for an artefact.
 *
 * Pure function. The host app computes `contentHashSha256` (we accept the
 * empty string when the host can't hash, e.g. streaming text where the final
 * bytes aren't materialised yet — the marker is still legally adequate
 * because the `<meta>` tag PLUS the `provider` + `model` + `generated_at`
 * triple is enough for an Art. 50(2) "detectable as artificially generated"
 * test).
 */
export function buildProvenanceClaim(args: {
  kind: SyntheticContentKind;
  provider: string;
  model: string;
  contentHashSha256?: string;
  generatedAt?: string;
  claimGenerator?: string;
}): C2paStyleClaim {
  return {
    version: 1,
    claim_generator: args.claimGenerator ?? 'AGI',
    kind: args.kind,
    generated_at: args.generatedAt ?? new Date().toISOString(),
    provider: args.provider,
    model: args.model,
    content_hash_sha256: args.contentHashSha256 ?? '',
    assertions: Object.freeze([
      Object.freeze({
        // Mirrors C2PA `c2pa.actions` assertion label.
        label: 'c2pa.actions',
        // Per C2PA, the AI generation action is "c2pa.created" with digitalSourceType
        // "trainedAlgorithmicMedia". We collapse to a single string here since we
        // serialise to JSON downstream.
        action: 'c2pa.created:trainedAlgorithmicMedia',
      }),
    ]),
    signature: null,
  };
}

/**
 * Stable JSON serialisation of a claim. Keys sorted so the same logical
 * claim always hashes to the same bytes — required for the JWS signing
 * service when we attach signatures later.
 */
export function serialiseClaim(claim: C2paStyleClaim): string {
  return JSON.stringify(claim, Object.keys(claim).sort());
}

/**
 * Renders the `<meta name="agi:ai-generated" ...>` tag for HTML exports.
 *
 * This is the EXACT tag the integration test grep-asserts (`<meta
 * name="agi:ai-generated"`). Do not rename the tag without updating the
 * test in lockstep — and only do so after a documented review against
 * Article 50(2) machine-readability requirements.
 *
 * Output attributes are HTML-escaped (`escapeHtmlAttribute`) to defend
 * against malformed model / provider strings.
 */
export function renderAiGeneratedMetaTag(args: {
  kind: SyntheticContentKind;
  provider: string;
  model: string;
  generatedAt?: string;
}): string {
  const provider = escapeHtmlAttribute(args.provider);
  const model = escapeHtmlAttribute(args.model);
  const kind = escapeHtmlAttribute(args.kind);
  const generatedAt = escapeHtmlAttribute(args.generatedAt ?? new Date().toISOString());
  return `<meta name="agi:ai-generated" content="true" data-kind="${kind}" data-provider="${provider}" data-model="${model}" data-generated-at="${generatedAt}">`;
}

/**
 * Injects the `<meta name="agi:ai-generated">` tag into the `<head>` of an
 * HTML document. Falls back to prepending the tag if no `<head>` is present.
 *
 * Defensive: never mutates a document twice (idempotent — finds existing
 * tag and replaces it). Returns the new HTML string.
 */
export function injectAiGeneratedMetaTag(args: {
  html: string;
  kind: SyntheticContentKind;
  provider: string;
  model: string;
  generatedAt?: string;
}): string {
  const tag = renderAiGeneratedMetaTag({
    kind: args.kind,
    provider: args.provider,
    model: args.model,
    ...(args.generatedAt !== undefined ? { generatedAt: args.generatedAt } : {}),
  });
  // Strip any prior agi:ai-generated meta tag — idempotent.
  // AUDIT-FIX: alert-474 — bound whitespace and attribute-tail runs to
  // mitigate polynomial-redos when the input contains many `<meta>` prefixes.
  const stripped = args.html.replace(
    /<meta[ \t]{1,32}name="agi:ai-generated"[^>]{0,2048}>[ \t\r\n]{0,32}/gi,
    '',
  );

  // Try to inject inside <head>.
  const headMatch = stripped.match(/<head[^>]*>/i);
  if (headMatch) {
    const insertAt = (headMatch.index ?? 0) + headMatch[0].length;
    return stripped.slice(0, insertAt) + '\n  ' + tag + stripped.slice(insertAt);
  }

  // No <head> — prepend.
  return tag + '\n' + stripped;
}

/**
 * Wraps a plain-text export with a small JSON sidecar block + a trailing
 * `<meta>` tag (the meta tag survives even when copy-paste into an HTML
 * editor strips JSON).
 *
 * Format chosen for compatibility with Markdown renderers: the sidecar is
 * inside an HTML comment so it renders invisibly, and the meta tag is at
 * the bottom where a reader's tooling can find it deterministically.
 */
export function wrapTextExportWithMarker(args: {
  text: string;
  provider: string;
  model: string;
  generatedAt?: string;
  contentHashSha256?: string;
}): string {
  const claim = buildProvenanceClaim({
    kind: 'text',
    provider: args.provider,
    model: args.model,
    ...(args.contentHashSha256 !== undefined ? { contentHashSha256: args.contentHashSha256 } : {}),
    ...(args.generatedAt !== undefined ? { generatedAt: args.generatedAt } : {}),
  });
  const sidecar = `<!-- agi:ai-generated:c2pa-claim ${serialiseClaim(claim)} -->`;
  const metaTag = renderAiGeneratedMetaTag({
    kind: 'text',
    provider: args.provider,
    model: args.model,
    ...(args.generatedAt !== undefined ? { generatedAt: args.generatedAt } : {}),
  });
  return `${sidecar}\n${args.text}\n${metaTag}\n`;
}

/**
 * Detector — given an export payload, returns true if it carries an
 * AGI-issued Article 50(2) marker. Used by tests + by the share-sheet
 * preview to display the "AI-generated" badge.
 */
export function hasAiGeneratedMarker(payload: string): boolean {
  if (/<meta\s+name="agi:ai-generated"/i.test(payload)) return true;
  if (/agi:ai-generated:c2pa-claim/i.test(payload)) return true;
  return false;
}

/**
 * HTML attribute escape. Tight allowlist replacement — no need for a full
 * HTML parser since we only emit attribute values.
 */
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

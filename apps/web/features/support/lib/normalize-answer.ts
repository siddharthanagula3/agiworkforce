/**
 * The single choke point every support reply passes through before a component
 * can see it.
 *
 * Founder decision 4: "abstain and escalate; ALWAYS cite." That rule is not
 * enforceable in a card component — a card renders what it is handed. So it is
 * enforced here, once, on the boundary:
 *
 *   - `kind:'answer'` with zero usable citations is COERCED to an abstention,
 *     and the answer prose is DISCARDED. Rendering the prose under an
 *     "I'm not certain" header would still be publishing an unsourced claim.
 *   - A citation whose URL is not a same-origin path or an http(s) URL is
 *     dropped before it can become an href. Model output and retrieved
 *     documents are both untrusted; `javascript:` and `data:` never reach the
 *     DOM.
 *   - An unrecognised payload (contract drift from another builder, a 500 page,
 *     an HTML error body) becomes an abstention with a handoff offer, never a
 *     blank bubble and never a confident-looking reply.
 *
 * Deleting this module does not "reduce polish" — it removes the guarantee.
 */

import {
  SUPPORT_ABSTENTION_REASONS,
  type SupportAbstentionReason,
  type SupportAbstentionView,
  type SupportCitation,
  type SupportReplyView,
} from './contract';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstString(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

function hasUnsafeCitationCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    if (
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0xad ||
      codePoint === 0x180e ||
      (codePoint >= 0x200b && codePoint <= 0x200f) ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      codePoint === 0x2028 ||
      codePoint === 0x2029 ||
      (codePoint >= 0x2060 && codePoint <= 0x2064) ||
      (codePoint >= 0x2066 && codePoint <= 0x206f) ||
      codePoint === 0xfeff ||
      (codePoint >= 0xfff9 && codePoint <= 0xfffb)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * A citation URL may be:
 *   - a same-origin path: `/docs/byok`, `/help#faq` (but never `//evil.example`
 *     which the browser reads as protocol-relative and resolves off-origin), or
 *   - an absolute `http:`/`https:` URL.
 * Everything else — `javascript:`, `data:`, `vbscript:`, `file:`, mailto,
 * whitespace-obfuscated schemes — is refused.
 */
export function isSafeCitationUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;
  // Two distinct attacks, closed by the same deny-list:
  //
  //  1. SCHEME SMUGGLING. Browsers strip C0/C1 controls and zero-width marks
  //     while parsing a scheme, so `java\tscript:` and `javascript\u200b:` are
  //     live `javascript:` URLs that a naive prefix check waves through.
  //  2. DISPLAY SPOOFING. Bidi overrides and isolates (U+202A-U+202E,
  //     U+2066-U+2069) reorder the RENDERED text without changing the
  //     resolved href, so a citation's visible label and its actual target can
  //     be made to disagree. Citation text comes from retrieved documents,
  //     which are untrusted, so this is reachable input.
  //
  // Refuse outright rather than strip-and-hope. A dropped citation degrades to
  // an abstention, which is the safe direction to fail in.
  if (hasUnsafeCitationCharacter(trimmed)) {
    return false;
  }
  const cleaned = trimmed;
  if (cleaned.startsWith('//')) return false;
  if (cleaned.startsWith('/')) return true;
  return /^https?:\/\/[^\s/$.?#][^\s]*$/i.test(cleaned);
}

/** True when the href points inside this app (so it can use client navigation). */
export function isInternalCitationUrl(url: string): boolean {
  return url.startsWith('/');
}

let citationCounter = 0;

function normalizeCitation(raw: unknown): SupportCitation | null {
  if (!isRecord(raw)) return null;
  // The answer engine spells these title/url; the account-context builder
  // spells them label/href. Accept both rather than silently dropping half.
  const title = firstString(raw['title'], raw['label'], raw['name']);
  const url = firstString(raw['url'], raw['href'], raw['path']);
  if (!title || !url) return null;
  if (!isSafeCitationUrl(url)) return null;

  const snippet = firstString(raw['snippet'], raw['excerpt']);
  const id =
    firstString(raw['id'], raw['chunkId'], raw['docId']) ?? `citation-${(citationCounter += 1)}`;

  const citation: SupportCitation = { id, title, url };
  if (snippet) citation.snippet = snippet;
  return citation;
}

export function normalizeCitations(raw: unknown): SupportCitation[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SupportCitation[] = [];
  for (const entry of raw) {
    const citation = normalizeCitation(entry);
    if (!citation) continue;
    if (seen.has(citation.url)) continue;
    seen.add(citation.url);
    out.push(citation);
  }
  return out;
}

const ABSTENTION_REASON_SET = new Set<string>(SUPPORT_ABSTENTION_REASONS);

function normalizeReason(raw: unknown): SupportAbstentionReason {
  if (typeof raw === 'string' && ABSTENTION_REASON_SET.has(raw)) {
    return raw as SupportAbstentionReason;
  }
  return 'unrecognized_response';
}

/** Plain-language copy used when the server supplied no text for an abstention. */
export const ABSTENTION_FALLBACK_TEXT: Record<SupportAbstentionReason, string> = {
  no_relevant_source:
    'I could not find anything in the documentation that answers this, so I am not going to guess.',
  hard_abstain_billing:
    'I do not answer billing questions — charges, refunds and invoices are handled by a person, not by me.',
  hard_abstain_data_deletion:
    'I do not answer questions about deleting data or accounts. A person handles those so nothing is lost by mistake.',
  hard_abstain_security:
    'I do not answer security questions. A person from the team responds to these directly.',
  hard_abstain_legal:
    'I do not answer legal or contractual questions. A person from the team responds to these directly.',
  unverifiable_citation:
    'I could not verify a source for that answer, so I am not going to state it.',
  malformed_model_output: 'I could not produce a reliable answer to that just now.',
  model_unavailable: 'The assistant is unavailable right now, so I cannot answer this.',
  corpus_unavailable:
    'The support documentation is unavailable right now, so I cannot answer this.',
  no_source: 'I could not point to a source for that, so I am not going to state it as fact.',
  unrecognized_response: 'I did not get a usable answer back, so I am not going to guess.',
  transport_error: 'I could not reach the support assistant just now.',
  not_available: 'The support assistant is not switched on for this site yet.',
};

/** Headings that name the refusal category, per the founder's hard-abstain rule. */
export const ABSTENTION_HEADING: Record<SupportAbstentionReason, string> = {
  no_relevant_source: "I don't have a source for this",
  hard_abstain_billing: 'Billing — a person handles this',
  hard_abstain_data_deletion: 'Data deletion — a person handles this',
  hard_abstain_security: 'Security — a person handles this',
  hard_abstain_legal: 'Legal — a person handles this',
  unverifiable_citation: "I couldn't verify a source",
  malformed_model_output: "I'm not going to guess at this",
  model_unavailable: "I can't answer this right now",
  corpus_unavailable: "I can't answer this right now",
  no_source: "I don't have a source for this",
  unrecognized_response: "I'm not going to guess at this",
  transport_error: "I couldn't reach the assistant",
  not_available: 'Assistant unavailable',
};

export function makeAbstention(
  reason: SupportAbstentionReason,
  options: { text?: string | null; citations?: SupportCitation[] } = {},
): SupportAbstentionView {
  const text = firstString(options.text) ?? ABSTENTION_FALLBACK_TEXT[reason];
  return {
    kind: 'abstention',
    reason,
    text,
    citations: options.citations ?? [],
    escalationOffered: true,
  };
}

const ACTION_ID_RE = /^[a-z][a-z0-9_]{0,63}$/;

function normalizeActionId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return ACTION_ID_RE.test(raw) ? raw : null;
}

/**
 * Turn whatever `POST /api/support/ask` returned into something a component is
 * allowed to render.
 */
export function normalizeAnswer(raw: unknown): SupportReplyView {
  if (!isRecord(raw)) return makeAbstention('unrecognized_response');

  const kind = raw['kind'];

  if (kind === 'abstention') {
    // The answer engine names these `authoritativeLinks`; accept `citations`
    // too so a rename on their side does not silently strip the links.
    const citations = [
      ...normalizeCitations(raw['authoritativeLinks']),
      ...normalizeCitations(raw['citations']),
    ];
    const deduped: SupportCitation[] = [];
    const seen = new Set<string>();
    for (const citation of citations) {
      if (seen.has(citation.url)) continue;
      seen.add(citation.url);
      deduped.push(citation);
    }
    return makeAbstention(normalizeReason(raw['reason']), {
      text: typeof raw['text'] === 'string' ? raw['text'] : null,
      citations: deduped,
    });
  }

  if (kind === 'answer') {
    const citations = normalizeCitations(raw['citations']);
    const text = firstString(raw['text'], raw['answer']);

    // THE RULE. No source ⇒ not an answer. The prose is dropped on purpose:
    // showing it under a softer header would still be publishing an unsourced
    // claim, which is exactly what the abstain-and-cite decision forbids.
    if (citations.length === 0 || !text) {
      return makeAbstention('no_source');
    }

    return {
      kind: 'answer',
      text,
      citations,
      proposedActionId: normalizeActionId(raw['proposedActionId']),
    };
  }

  return makeAbstention('unrecognized_response');
}

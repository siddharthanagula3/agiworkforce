/**
 * Hard-abstain classification — deterministic, pre-retrieval, pre-model.
 *
 * Four categories are refused regardless of retrieval confidence, per founder
 * decision: billing/charges, data deletion and retention, security, and
 * legal/policy interpretation. A hit returns an abstention BEFORE retrieval and
 * BEFORE any provider call.
 *
 * That ordering is the strongest guarantee available here: a retrieved document
 * cannot argue the agent out of abstaining on billing, because on a billing
 * question no document is ever retrieved and no model is ever run. The rules
 * live in code and are never stated in the prompt as something a model could be
 * talked out of.
 *
 * Pure — no I/O. The same classifier runs a second time over generated answer
 * text as a backstop for obliquely phrased questions.
 *
 * KNOWN LIMIT: a deterministic pattern table has imperfect recall. It is tuned
 * for PRECISION on the pre-model gate (cheap, unambiguous, unarguable), with the
 * post-generation re-classification as the second net. Neither is exhaustive;
 * real transcripts should be reviewed for missed cases once escalation captures
 * them.
 */

import type { HardAbstainCategory } from '../types';
import { normalizeText } from '../retrieval/tokenize';

interface CategoryRules {
  category: HardAbstainCategory;
  patterns: RegExp[];
}

/**
 * Patterns run against NFKC-lowercased text with punctuation collapsed to
 * spaces, so `\b` boundaries behave predictably.
 */
const RULES: readonly CategoryRules[] = Object.freeze([
  {
    category: 'billing',
    patterns: [
      /\bcharge(d|s)?\b/,
      /\brefund(s|ed|ing)?\b/,
      /\binvoice(s|d)?\b/,
      /\breceipt(s)?\b/,
      /\bbill(ed|ing|s)?\b/,
      /\bovercharg/,
      /\bproration\b|\bprorated\b/,
      /\bchargeback(s)?\b/,
      /\bcredit card\b|\bpayment method\b|\bdebit(ed)?\b/,
      /\bsubscription (cost|price|charge|renewal|renew)\b/,
      /\bhow much (do|does|will|am|did) i (pay|owe|get charged)\b/,
      /\bwhy (was|were|am|did) i (charged|billed)\b/,
      /\bdouble (charged|billed)\b/,
      /\bcancel (my )?(subscription|plan|billing)\b/,
      /\bupgrade (my )?(plan|subscription)\b|\bdowngrade\b/,
    ],
  },
  {
    category: 'data_deletion',
    patterns: [
      /\bdelete my (account|data|conversations?|history|messages?)\b/,
      /\bdeletion\b/,
      /\berasure\b|\bright to be forgotten\b/,
      /\bpurge\b/,
      /\bretention\b|\bretain(ed|s)?\b/,
      /\bhow long do you (keep|store|retain)\b/,
      /\bwipe (my|all) (data|account)\b/,
      /\bremove (all )?my (data|information|personal data)\b/,
      /\bclose my account\b/,
      /\bgdpr\b|\bccpa\b|\bdsar\b|\bsubject access request\b/,
    ],
  },
  {
    category: 'security',
    patterns: [
      /\bbreach(es|ed)?\b/,
      /\bvulnerabilit(y|ies)\b/,
      /\bcve-\d/,
      /\bexploit(ed|s)?\b/,
      /\b(security )?incident\b/,
      /\bpen ?test(ing)?\b|\bpenetration test/,
      /\bencrypt(ion|ed)?\b/,
      /\bsoc ?2\b|\biso ?27001\b|\bhipaa\b|\bfedramp\b|\bpci ?dss\b/,
      /\bis .{0,30}\bsecure\b/,
      /\bhow secure\b/,
      /\bzero[- ]?day\b/,
      /\bthreat model\b/,
      /\baudit log(s|ging)?\b/,
      /\bhacked\b|\bcompromised\b|\bleak(ed|s)?\b/,
    ],
  },
  {
    category: 'legal',
    patterns: [
      /\bterms of (service|use)\b|\bthe terms\b|\btos\b/,
      /\bdpa\b|\bdata processing (agreement|addendum)\b/,
      /\bliabilit(y|ies)\b/,
      /\bindemnif|\bindemnity\b/,
      /\blicen[sc]e(d|s|ing)?\b/,
      /\bcomplian(t|ce)\b/,
      /\bsub ?processors?\b/,
      /\bam i allowed to\b|\bare we allowed to\b/,
      /\bis it legal\b|\blegally\b|\blawful\b/,
      /\bcontract(ual)?\b/,
      /\bsla\b|\bservice level agreement\b/,
      /\bcopyright\b|\bintellectual property\b|\bwho owns\b/,
      /\bwarrant(y|ies)\b/,
      /\bprivacy policy\b/,
    ],
  },
]);

/** Category order is fixed so classification is deterministic on overlap. */
export const SUPPORT_ABSTAIN_CATEGORIES: readonly HardAbstainCategory[] = Object.freeze(
  RULES.map((rule) => rule.category),
);

function prepare(text: string): string {
  return normalizeText(text).replace(/[^a-z0-9+]+/g, ' ');
}

/**
 * Returns the first matching hard-abstain category, or null.
 *
 * Exported so the widget can pre-empt a pointless round trip — but the server
 * classifies again regardless. A client-side check is a latency optimization,
 * never the gate.
 */
export function classifyHardAbstain(text: string): HardAbstainCategory | null {
  if (!text) return null;
  const prepared = prepare(text);
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(prepared)) return rule.category;
    }
  }
  return null;
}

export const HARD_ABSTAIN_REASON: Readonly<
  Record<HardAbstainCategory, `hard_abstain_${HardAbstainCategory}`>
> = Object.freeze({
  billing: 'hard_abstain_billing',
  data_deletion: 'hard_abstain_data_deletion',
  security: 'hard_abstain_security',
  legal: 'hard_abstain_legal',
});

export const HARD_ABSTAIN_COPY: Readonly<Record<HardAbstainCategory, string>> = Object.freeze({
  billing:
    "I won't guess about charges, invoices, or what you'll be billed — getting that wrong costs you money. " +
    'Here are the authoritative pages, and I can put you in touch with a human who can look at your account.',
  data_deletion:
    "I won't guess about data deletion or how long anything is retained — that has to come from the published policy, not from me. " +
    'Here are the authoritative pages, and I can hand you to a human.',
  security:
    "I won't speculate about security posture, incidents, or compliance status. " +
    'Here are the authoritative pages, and I can hand you to a human who can answer properly.',
  legal:
    "I won't interpret the terms, the DPA, or anything else legal — that needs to come from the documents themselves or from a person. " +
    'Here are the authoritative pages, and I can hand you to a human.',
});

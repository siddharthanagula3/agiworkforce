/**
 * factExtractor — keyword-heuristic extraction of durable user facts from a
 * chat message. This is the v1 "learns day by day" engine: after a turn, scan
 * the user's own words for self-disclosure patterns and turn the salient ones
 * into short third-person facts that get stored (low-trust, user-deletable) and
 * later injected as memory.
 *
 * Design choices (deliberately conservative — precision over recall):
 *   - Only first-person self-disclosure ("I'm a…", "I prefer…", "my name is…",
 *     "remember that…"). No second-person, no questions.
 *   - Skip interrogative messages (a trailing "?") — questions aren't facts.
 *   - Cap the captured clause length so we never store a paragraph.
 *   - Normalize to third person ("User …") so injected memory reads cleanly.
 *   - Pure + synchronous: no store / IO. The caller persists + dedupes.
 *
 * This will have false positives; that is acceptable because facts are stored
 * at low trust, shown in the Memory screen, and deletable by the user.
 */

/** Max characters of a captured clause kept as a fact (excludes the prefix). */
const MAX_CLAUSE = 120;
/** Min characters for a captured clause to be worth storing. */
const MIN_CLAUSE = 2;

interface Pattern {
  /** Matches the lead-in; group 1 is the captured value. */
  re: RegExp;
  /** Builds the stored fact from the captured value. */
  format: (value: string) => string;
}

// Patterns run against a single sentence, lower-cased for matching but the
// ORIGINAL-cased capture is used in the output so proper nouns are preserved.
const PATTERNS: Pattern[] = [
  { re: /\bmy name is\s+(.+)/i, format: (v) => `User's name is ${v}` },
  { re: /\bi am a\s+(.+)/i, format: (v) => `User is a ${v}` },
  { re: /\bi'm a\s+(.+)/i, format: (v) => `User is a ${v}` },
  { re: /\bi am an\s+(.+)/i, format: (v) => `User is an ${v}` },
  { re: /\bi'm an\s+(.+)/i, format: (v) => `User is an ${v}` },
  { re: /\bi work as\s+(.+)/i, format: (v) => `User works as ${v}` },
  { re: /\bi work at\s+(.+)/i, format: (v) => `User works at ${v}` },
  { re: /\bi work in\s+(.+)/i, format: (v) => `User works in ${v}` },
  { re: /\bi live in\s+(.+)/i, format: (v) => `User lives in ${v}` },
  { re: /\bi'm from\s+(.+)/i, format: (v) => `User is from ${v}` },
  { re: /\bi am from\s+(.+)/i, format: (v) => `User is from ${v}` },
  { re: /\bi prefer\s+(.+)/i, format: (v) => `User prefers ${v}` },
  { re: /\bi really like\s+(.+)/i, format: (v) => `User likes ${v}` },
  { re: /\bi like\s+(.+)/i, format: (v) => `User likes ${v}` },
  { re: /\bi love\s+(.+)/i, format: (v) => `User loves ${v}` },
  { re: /\bi hate\s+(.+)/i, format: (v) => `User dislikes ${v}` },
  { re: /\bi don't like\s+(.+)/i, format: (v) => `User dislikes ${v}` },
  { re: /\bremember that\s+(.+)/i, format: (v) => capitalize(v) },
  { re: /\bremember:\s+(.+)/i, format: (v) => capitalize(v) },
  { re: /\bnote that\s+(.+)/i, format: (v) => capitalize(v) },
  { re: /\bfor future reference[,:]?\s+(.+)/i, format: (v) => capitalize(v) },
];

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Trim trailing sentence punctuation/whitespace from a captured clause. */
function cleanClause(raw: string): string {
  return raw
    .trim()
    .replace(/[.!?,;:\s]+$/u, '')
    .trim();
}

/** Split a message into rough sentences for per-sentence pattern matching. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?\n])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Extract candidate facts from a single user message. Returns normalized,
 * de-duplicated third-person fact strings (possibly empty). Never throws.
 */
export function extractCandidateFacts(message: string): string[] {
  if (!message || typeof message !== 'string') return [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const sentence of splitSentences(message)) {
    // Skip questions — they're not statements of fact about the user.
    if (sentence.trimEnd().endsWith('?')) continue;

    for (const { re, format } of PATTERNS) {
      const m = re.exec(sentence);
      if (!m) continue;
      const clause = cleanClause(m[1] ?? '');
      if (clause.length < MIN_CLAUSE || clause.length > MAX_CLAUSE) break;
      const fact = format(clause).trim();
      const key = fact.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(fact);
      }
      // One pattern per sentence — the earliest (most specific) wins.
      break;
    }
  }

  return out;
}

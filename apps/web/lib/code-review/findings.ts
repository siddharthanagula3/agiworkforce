import { createHash } from 'node:crypto';
import { z } from 'zod';

import { anchorableLines, type ReviewDiffFile } from './diff';

export const REVIEW_SEVERITIES = ['blocker', 'major', 'minor', 'nit'] as const;
export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

export const REVIEW_PASSES = ['correctness', 'security'] as const;
export type ReviewPass = (typeof REVIEW_PASSES)[number];

const MAX_FINDINGS_PER_CHUNK = 20;

export const ReviewFindingSchema = z
  .object({
    path: z.string().min(1).max(512),
    line: z.number().int().positive(),
    severity: z.enum(REVIEW_SEVERITIES),
    title: z.string().min(1).max(160),
    /** The text in the diff the claim rests on. A claim without one is dropped. */
    evidence: z.string().min(1).max(600),
    explanation: z.string().min(1).max(1200),
    suggestion: z.string().max(1200).optional(),
  })
  .strict();

export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;

export interface AnchoredFinding extends ReviewFinding {
  pass: ReviewPass;
  fingerprint: string;
}

const ReviewResponseSchema = z
  .object({
    summary: z.string().max(2000).optional(),
    findings: z.array(ReviewFindingSchema).max(MAX_FINDINGS_PER_CHUNK),
  })
  .strict();

export interface ParsedReviewResponse {
  summary: string;
  findings: ReviewFinding[];
}

/**
 * Read the model's answer as data. A response that is not the agreed shape
 * yields nothing: posting prose we could not parse as findings is how a review
 * comment ends up claiming a line that does not exist.
 */
export function parseReviewResponse(text: string): ParsedReviewResponse | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const result = ReviewResponseSchema.safeParse(parsed);
  if (!result.success) return null;
  return { summary: result.data.summary?.trim() ?? '', findings: result.data.findings };
}

export interface AnchorCheck {
  anchored: AnchoredFinding[];
  /** Findings dropped because the file or line is not in this diff. */
  fabricated: ReviewFinding[];
}

/**
 * Keep only the findings the diff can carry.
 *
 * A model will name a plausible file and a plausible line, and a review that
 * posts one it invented is worse than no review: it sends a reader to code that
 * does not say what the comment claims. The diff is the authority, so every
 * finding is checked against the lines actually present on the head side.
 */
export function anchorFindings(
  findings: readonly ReviewFinding[],
  files: readonly ReviewDiffFile[],
  pass: ReviewPass,
): AnchorCheck {
  const anchors = anchorableLines(files);
  const anchored: AnchoredFinding[] = [];
  const fabricated: ReviewFinding[] = [];
  const seen = new Set<string>();

  for (const finding of findings) {
    const lines = anchors.get(finding.path);
    if (!lines?.has(finding.line)) {
      fabricated.push(finding);
      continue;
    }
    const fingerprint = fingerprintFinding(finding);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    anchored.push({ ...finding, pass, fingerprint });
  }

  return { anchored, fabricated };
}

/**
 * Identity of a finding across review runs: the same claim about the same line
 * of the same file is the same comment, whatever wording the model reached for
 * the second time.
 */
export function fingerprintFinding(finding: ReviewFinding): string {
  const normalizedTitle = finding.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return createHash('sha256')
    .update(`${finding.path}\n${finding.line}\n${finding.severity}\n${normalizedTitle}`)
    .digest('hex')
    .slice(0, 16);
}

const FINGERPRINT_MARKER = /<!--\s*agi-review:([0-9a-f]{16})\s*-->/g;

/** The marker carried in a posted comment, which is what makes dedup possible. */
export function fingerprintMarker(fingerprint: string): string {
  return `<!-- agi-review:${fingerprint} -->`;
}

export function fingerprintsInPostedComments(bodies: readonly string[]): Set<string> {
  const seen = new Set<string>();
  for (const body of bodies) {
    FINGERPRINT_MARKER.lastIndex = 0;
    let match;
    while ((match = FINGERPRINT_MARKER.exec(body)) !== null) {
      if (match[1]) seen.add(match[1]);
    }
  }
  return seen;
}

const SEVERITY_LABEL: Record<ReviewSeverity, string> = {
  blocker: 'Blocker',
  major: 'Major',
  minor: 'Minor',
  nit: 'Nit',
};

export function renderFindingComment(finding: AnchoredFinding): string {
  const suggestion = finding.suggestion?.trim()
    ? `\n\n**Suggestion**\n\n${finding.suggestion.trim()}`
    : '';
  return [
    `**${SEVERITY_LABEL[finding.severity]} · ${finding.pass}** ${finding.title}`,
    '',
    finding.explanation.trim(),
    '',
    `**Evidence**\n\n\`\`\`\n${finding.evidence.trim()}\n\`\`\``,
    suggestion,
    '',
    fingerprintMarker(finding.fingerprint),
  ].join('\n');
}

const SEVERITY_ORDER: Record<ReviewSeverity, number> = {
  blocker: 0,
  major: 1,
  minor: 2,
  nit: 3,
};

export function sortFindings(findings: readonly AnchoredFinding[]): AnchoredFinding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.path.localeCompare(b.path) ||
      a.line - b.line,
  );
}

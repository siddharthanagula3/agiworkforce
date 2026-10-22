import { createHash } from 'node:crypto';
import { z } from 'zod';

import { SECURITY_SCAN_SEVERITIES, type SecurityScanSeverity } from '@agiworkforce/cloud-contracts';

export const MAX_FINDINGS_PER_BATCH = 8;
const EVIDENCE_LINE_WINDOW = 3;
const PATCH_CONTEXT_LINES = 3;
const PATCHABLE_PATH_RE = /^[A-Za-z0-9._@+\-/]+$/;

const CandidateFindingSchema = z
  .object({
    path: z.string().min(1).max(512),
    line: z.number().int().positive(),
    severity: z.enum(SECURITY_SCAN_SEVERITIES),
    category: z.string().min(1).max(80),
    title: z.string().min(1).max(160),
    explanation: z.string().min(1).max(1500),
    evidence: z.string().min(1).max(1200),
    fix: z
      .object({
        original: z.string().min(1).max(4000),
        replacement: z.string().max(6000),
      })
      .strict(),
  })
  .strict();

export type CandidateFinding = z.infer<typeof CandidateFindingSchema>;

const ScanResponseSchema = z
  .object({ findings: z.array(CandidateFindingSchema).max(MAX_FINDINGS_PER_BATCH) })
  .strict();

const VerdictSchema = z
  .object({
    id: z.string().min(1).max(64),
    verdict: z.enum(['confirmed', 'refuted']),
    reason: z.string().min(1).max(600),
  })
  .strict();

const VerificationResponseSchema = z.object({ verdicts: z.array(VerdictSchema) }).strict();

export type Verdict = z.infer<typeof VerdictSchema>;

function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

export function parseScanResponse(text: string): CandidateFinding[] | null {
  const result = ScanResponseSchema.safeParse(extractJsonObject(text));
  return result.success ? result.data.findings : null;
}

export function parseVerificationResponse(text: string): Map<string, Verdict> | null {
  const result = VerificationResponseSchema.safeParse(extractJsonObject(text));
  if (!result.success) return null;
  return new Map(result.data.verdicts.map((verdict) => [verdict.id, verdict]));
}

export function findingId(finding: Pick<CandidateFinding, 'path' | 'line' | 'title'>): string {
  const normalizedTitle = finding.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return createHash('sha256')
    .update(`${finding.path}\n${finding.line}\n${normalizedTitle}`)
    .digest('hex')
    .slice(0, 16);
}

function trimmedLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface EvidenceSpan {
  firstLine: number;
  lastLine: number;
}

export function locateEvidence(
  content: string,
  evidence: string,
  line: number,
): EvidenceSpan | null {
  const wanted = trimmedLines(evidence);
  if (wanted.length === 0) return null;
  const fileLines = content.split('\n').map((entry) => entry.trim());
  if (line > fileLines.length) return null;
  const target = line - 1;
  for (let start = 0; start + wanted.length <= fileLines.length; start += 1) {
    const end = start + wanted.length - 1;
    if (start > target + EVIDENCE_LINE_WINDOW || end < target - EVIDENCE_LINE_WINDOW) continue;
    if (wanted.every((expected, offset) => fileLines[start + offset] === expected)) {
      return { firstLine: start + 1, lastLine: end + 1 };
    }
  }
  return null;
}

interface FileLine {
  text: string;
  newline: boolean;
}

function toFileLines(content: string): FileLine[] {
  if (content.length === 0) return [];
  const parts = content.split('\n');
  const endsWithNewline = content.endsWith('\n');
  if (endsWithNewline) parts.pop();
  return parts.map((text, index) => ({
    text,
    newline: index < parts.length - 1 || endsWithNewline,
  }));
}

function sameLine(a: FileLine | undefined, b: FileLine | undefined): boolean {
  return a !== undefined && b !== undefined && a.text === b.text && a.newline === b.newline;
}

function emit(prefix: string, line: FileLine): string[] {
  return line.newline
    ? [`${prefix}${line.text}`]
    : [`${prefix}${line.text}`, '\\ No newline at end of file'];
}

function hunkRange(start: number, count: number): string {
  return `${count === 0 ? start : start + 1},${count}`;
}

export function buildUnifiedPatch(path: string, before: string, after: string): string | null {
  const oldLines = toFileLines(before);
  const newLines = toFileLines(after);
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    sameLine(oldLines[prefix], newLines[prefix])
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    sameLine(oldLines[oldLines.length - 1 - suffix], newLines[newLines.length - 1 - suffix])
  ) {
    suffix += 1;
  }
  const removed = oldLines.slice(prefix, oldLines.length - suffix);
  const added = newLines.slice(prefix, newLines.length - suffix);
  if (removed.length === 0 && added.length === 0) return null;

  const contextStart = Math.max(0, prefix - PATCH_CONTEXT_LINES);
  const leadingContext = oldLines.slice(contextStart, prefix);
  const afterStart = oldLines.length - suffix;
  const trailingContext = oldLines.slice(
    afterStart,
    afterStart + Math.min(PATCH_CONTEXT_LINES, suffix),
  );
  const oldCount = leadingContext.length + removed.length + trailingContext.length;
  const newCount = leadingContext.length + added.length + trailingContext.length;

  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${hunkRange(contextStart, oldCount)} +${hunkRange(contextStart, newCount)} @@`,
    ...leadingContext.flatMap((line) => emit(' ', line)),
    ...removed.flatMap((line) => emit('-', line)),
    ...added.flatMap((line) => emit('+', line)),
    ...trailingContext.flatMap((line) => emit(' ', line)),
    '',
  ].join('\n');
}

export type AnchorOutcome =
  | { ok: true; patch: string; span: EvidenceSpan }
  | { ok: false; reason: 'unanchored' | 'patch-rejected' };

function lineOfOffset(content: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (content.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

export function anchorCandidate(
  candidate: CandidateFinding,
  content: string | undefined,
): AnchorOutcome {
  if (content === undefined) return { ok: false, reason: 'unanchored' };
  const span = locateEvidence(content, candidate.evidence, candidate.line);
  if (!span) return { ok: false, reason: 'unanchored' };

  const { original, replacement } = candidate.fix;
  if (!PATCHABLE_PATH_RE.test(candidate.path) || original === replacement) {
    return { ok: false, reason: 'patch-rejected' };
  }
  const offset = content.indexOf(original);
  if (offset === -1 || content.indexOf(original, offset + 1) !== -1) {
    return { ok: false, reason: 'patch-rejected' };
  }
  const fixFirstLine = lineOfOffset(content, offset);
  const fixLastLine = fixFirstLine + (original.match(/\n/g)?.length ?? 0);
  if (
    fixLastLine < span.firstLine - EVIDENCE_LINE_WINDOW ||
    fixFirstLine > span.lastLine + EVIDENCE_LINE_WINDOW
  ) {
    return { ok: false, reason: 'patch-rejected' };
  }
  const patched = content.slice(0, offset) + replacement + content.slice(offset + original.length);
  const patch = buildUnifiedPatch(candidate.path, content, patched);
  return patch ? { ok: true, patch, span } : { ok: false, reason: 'patch-rejected' };
}

const SEVERITY_ORDER: Record<SecurityScanSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function compareSeverity(a: SecurityScanSeverity, b: SecurityScanSeverity): number {
  return SEVERITY_ORDER[a] - SEVERITY_ORDER[b];
}

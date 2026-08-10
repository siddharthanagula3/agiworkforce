/**
 * Check Run payload builders.
 *
 * Pure functions producing the exact REST payloads for
 * `POST /repos/{owner}/{repo}/check-runs`, including annotation batching
 * (GitHub accepts at most 50 annotations per request).
 */
import {
  SEVERITY_WEIGHT,
  rankFindings,
  type CheckConclusion,
  type Finding,
  type PolicyDecision,
  type ScannerRun,
} from '@agiworkforce/guardian-core';

export const CHECK_NAMES = {
  correctness: 'AGI Guardian / Correctness',
  security: 'AGI Guardian / Security',
  'supply-chain': 'AGI Guardian / Supply Chain',
  architecture: 'AGI Guardian / Architecture',
  'technical-debt': 'AGI Guardian / Technical Debt',
  'ai-slop': 'AGI Guardian / AI Slop and Completeness',
  tests: 'AGI Guardian / Tests',
  performance: 'AGI Guardian / Performance',
  policy: 'AGI Guardian / Final Policy',
} as const;

export const MAX_ANNOTATIONS_PER_REQUEST = 50;

export interface CheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: 'notice' | 'warning' | 'failure';
  title: string;
  message: string;
}

export interface CheckRunPayload {
  name: string;
  head_sha: string;
  status: 'completed';
  conclusion: CheckConclusion;
  output: {
    title: string;
    summary: string;
    annotations: CheckAnnotation[];
  };
}

function annotationLevel(finding: Finding): CheckAnnotation['annotation_level'] {
  if (SEVERITY_WEIGHT[finding.severity] >= SEVERITY_WEIGHT.high) return 'failure';
  if (finding.severity === 'medium') return 'warning';
  return 'notice';
}

export function toAnnotation(finding: Finding): CheckAnnotation {
  return {
    path: finding.path,
    start_line: finding.start_line ?? 1,
    end_line: finding.end_line ?? finding.start_line ?? 1,
    annotation_level: annotationLevel(finding),
    title: finding.title.slice(0, 255),
    message:
      `${finding.evidence}\n\nImpact: ${finding.impact}${finding.suggested_fix ? `\n\nSuggested fix: ${finding.suggested_fix}` : ''}`.slice(
        0,
        60_000,
      ),
  };
}

/** Split annotations into API-sized batches; the first batch rides on create. */
export function batchAnnotations(annotations: readonly CheckAnnotation[]): CheckAnnotation[][] {
  const batches: CheckAnnotation[][] = [];
  for (let i = 0; i < annotations.length; i += MAX_ANNOTATIONS_PER_REQUEST) {
    batches.push(annotations.slice(i, i + MAX_ANNOTATIONS_PER_REQUEST));
  }
  return batches;
}

export interface CategoryCheck {
  payload: CheckRunPayload;
  /** Annotation batches beyond the first, to send as check-run updates. */
  overflowBatches: CheckAnnotation[][];
}

/**
 * Build one category check run. Category checks are informational: their
 * conclusion is neutral when findings exist and success when clean; only the
 * Final Policy check may fail a PR.
 */
export function buildCategoryCheck(
  name: string,
  headSha: string,
  findings: readonly Finding[],
  scannerRuns: readonly ScannerRun[],
): CategoryCheck {
  const ranked = rankFindings(findings);
  const failedScanners = scannerRuns.filter(
    (s) => s.status === 'scanner-failed' || s.status === 'timeout',
  );

  const lines: string[] = [];
  if (ranked.length === 0 && failedScanners.length === 0) {
    lines.push('No findings.');
  }
  if (failedScanners.length > 0) {
    lines.push('### Scanners that did not complete (results are NOT clean)');
    for (const s of failedScanners)
      lines.push(`- \`${s.scanner_id}\` (${s.status}): ${s.error ?? 'no detail'}`);
    lines.push('');
  }
  if (ranked.length > 0) {
    lines.push(`### Findings (${ranked.length})`);
    for (const f of ranked.slice(0, 100)) {
      const location = f.start_line ? `${f.path}:${f.start_line}` : f.path;
      lines.push(`- **${f.severity}** \`${f.rule_id}\` ${location} — ${f.title}`);
    }
    if (ranked.length > 100) lines.push(`- …and ${ranked.length - 100} more (see dashboard)`);
  }

  const annotations = ranked.map(toAnnotation);
  const batches = batchAnnotations(annotations);
  return {
    payload: {
      name,
      head_sha: headSha,
      status: 'completed',
      conclusion: ranked.length === 0 && failedScanners.length === 0 ? 'success' : 'neutral',
      output: {
        title:
          ranked.length === 0
            ? failedScanners.length > 0
              ? `${failedScanners.length} scanner(s) failed`
              : 'Clean'
            : `${ranked.length} finding(s)`,
        summary: lines.join('\n'),
        annotations: batches[0] ?? [],
      },
    },
    overflowBatches: batches.slice(1),
  };
}

/** Build the single required Final Policy check from a policy decision. */
export function buildPolicyCheck(headSha: string, decision: PolicyDecision): CheckRunPayload {
  const lines: string[] = [];
  for (const reason of decision.reasons) lines.push(`- ${reason}`);
  if (decision.blocking.length > 0) {
    lines.push('', `### Blocking findings (${decision.blocking.length})`);
    for (const f of decision.blocking) {
      lines.push(
        `- **${f.severity}** \`${f.rule_id}\` ${f.path}${f.start_line ? `:${f.start_line}` : ''} — ${f.title}`,
      );
    }
  }
  lines.push('', `Advisory findings: ${decision.advisory.length}`);
  return {
    name: CHECK_NAMES.policy,
    head_sha: headSha,
    status: 'completed',
    conclusion: decision.conclusion,
    output: {
      title:
        decision.conclusion === 'failure'
          ? `${decision.blocking.length} blocking finding(s)`
          : decision.conclusion === 'neutral'
            ? 'Advisory (no blocking enforcement)'
            : 'Passed',
      summary: lines.join('\n') || 'No findings.',
      annotations: [],
    },
  };
}

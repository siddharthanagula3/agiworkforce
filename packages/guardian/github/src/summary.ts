import {
  rankFindings,
  type Finding,
  type PolicyDecision,
  type ScannerRun,
} from '@agiworkforce/guardian-core';

export const SUMMARY_MARKER = '<!-- agi-guardian-summary -->';

export interface SummaryInput {
  headSha: string;
  mode: 'shadow' | 'advisory' | 'blocking';
  decision: PolicyDecision;
  findings: readonly Finding[];
  fixedSincePreviousRun: readonly Finding[];
  scannerRuns: readonly ScannerRun[];
}

export function findSummaryComment<T extends { body?: string | null }>(
  comments: readonly T[],
): T | undefined {
  return comments.find((c) => typeof c.body === 'string' && c.body.includes(SUMMARY_MARKER));
}

export function buildSummaryComment(input: SummaryInput): string {
  const { decision, findings, fixedSincePreviousRun, scannerRuns } = input;
  const ranked = rankFindings(findings);
  const counts = countBySeverity(ranked);
  const failedScanners = scannerRuns.filter(
    (s) => s.status === 'scanner-failed' || s.status === 'timeout',
  );

  const lines: string[] = [SUMMARY_MARKER, '## AGI Guardian review', ''];
  lines.push(
    `Reviewed head \`${input.headSha.slice(0, 12)}\` in **${input.mode} mode**, ` +
      (decision.conclusion === 'failure'
        ? `❌ ${decision.blocking.length} blocking finding(s)`
        : ranked.length === 0
          ? '✅ no findings'
          : `⚠️ ${ranked.length} advisory finding(s)`),
  );
  lines.push('');

  if (ranked.length > 0) {
    lines.push(
      `| Critical | High | Medium | Low | Info |`,
      `|---|---|---|---|---|`,
      `| ${counts.critical} | ${counts.high} | ${counts.medium} | ${counts.low} | ${counts.info} |`,
      '',
    );
    lines.push('<details><summary>Top findings</summary>', '');
    for (const f of ranked.slice(0, 15)) {
      const location = f.start_line ? `\`${f.path}:${f.start_line}\`` : `\`${f.path}\``;
      lines.push(`- **${f.severity}** ${location}, ${f.title} _(${f.rule_id})_`);
    }
    if (ranked.length > 15)
      lines.push(`- …and ${ranked.length - 15} more in the check-run summaries`);
    lines.push('', '</details>', '');
  }

  if (fixedSincePreviousRun.length > 0) {
    lines.push(`✅ Fixed since the previous run: ${fixedSincePreviousRun.length}`);
    for (const f of fixedSincePreviousRun.slice(0, 10)) lines.push(`- ${f.title} (\`${f.path}\`)`);
    lines.push('');
  }

  if (failedScanners.length > 0) {
    lines.push('⚠️ Scanners that did not complete (their coverage is missing, not clean):');
    for (const s of failedScanners) lines.push(`- \`${s.scanner_id}\` (${s.status})`);
    lines.push('');
  }

  lines.push('---');
  lines.push(
    '_`/agi help` for commands. Findings are verified before publishing; this comment is edited in place._',
  );
  return lines.join('\n');
}

interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

function countBySeverity(findings: readonly Finding[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

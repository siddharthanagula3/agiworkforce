/**
 * Gitleaks JSON report adapter (`gitleaks detect --report-format json`).
 *
 * The raw report contains the matched secret. It must never survive into a
 * finding, log line, or model prompt — only rule id, path, and line range are
 * kept, and the description passes through the redactor as a second layer.
 */
import { z } from 'zod';

import { toEvidence, type AdapterOutcome, type RawFinding } from './types.js';

const GitleaksLeakSchema = z.object({
  RuleID: z.string(),
  Description: z.string().optional().default(''),
  File: z.string(),
  StartLine: z.number().int().optional(),
  EndLine: z.number().int().optional(),
  Commit: z.string().optional(),
  // Secret / Match / Line fields exist in the report but are deliberately
  // never read: they contain the credential itself.
});

const GitleaksReportSchema = z.array(GitleaksLeakSchema);

export function parseGitleaksOutput(jsonText: string): AdapterOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText === '' ? '[]' : jsonText);
  } catch (error) {
    return {
      status: 'scanner-failed',
      findings: [],
      error: `unparseable gitleaks output: ${String(error)}`,
    };
  }
  const result = GitleaksReportSchema.safeParse(parsed);
  if (!result.success) {
    return {
      status: 'scanner-failed',
      findings: [],
      error: 'gitleaks output did not match the report shape',
    };
  }

  const findings: RawFinding[] = result.data.map((leak) => ({
    rule_id: `gitleaks/${leak.RuleID}`,
    source: 'gitleaks',
    source_type: 'gitleaks',
    category: 'security',
    subcategory: 'secret',
    severity: 'critical',
    confidence: 0.95,
    path: leak.File,
    start_line: leak.StartLine && leak.StartLine > 0 ? leak.StartLine : null,
    end_line: leak.EndLine && leak.EndLine > 0 ? leak.EndLine : null,
    title: `Potential secret: ${leak.RuleID}`,
    evidence: toEvidence(
      `gitleaks rule ${leak.RuleID} matched in ${leak.File}. ${leak.Description}`,
    ),
    impact:
      'A committed credential is exposed to everyone with repository read access and to git history forever.',
    failure_scenario:
      'Anyone who clones or reads the repository extracts the credential and uses it against the backing service.',
    suggested_fix:
      'Rotate the credential, remove it from the file, and load it from the environment or secret store.',
    deterministic_evidence: [
      { source_type: 'gitleaks', rule_id: leak.RuleID, summary: `match in ${leak.File}` },
    ],
  }));

  return { status: findings.length > 0 ? 'findings' : 'clean', findings };
}

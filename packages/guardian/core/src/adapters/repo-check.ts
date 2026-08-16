import { toEvidence, type AdapterOutcome } from './types.js';
import type { FindingCategory, Severity } from '../schema.js';

export interface RepoCheckSpec {
  script: string;
  category: FindingCategory;
  severity: Severity;
  impact: string;
}

export interface RepoCheckExecution {
  exitCode: number | null;
  outputTail: string;
  failedToRun: boolean;
}

export function parseRepoCheckResult(
  spec: RepoCheckSpec,
  execution: RepoCheckExecution,
): AdapterOutcome {
  if (execution.failedToRun || execution.exitCode === null) {
    return {
      status: 'scanner-failed',
      findings: [],
      error: toEvidence(
        `"${spec.script}" did not run to completion: ${execution.outputTail || 'no output'}`,
      ),
    };
  }
  if (execution.exitCode === 0) {
    return { status: 'clean', findings: [] };
  }
  return {
    status: 'findings',
    findings: [
      {
        rule_id: `repo/${spec.script}`,
        source: spec.script,
        source_type: 'repo-check',
        category: spec.category,
        severity: spec.severity,
        confidence: 1,
        path: 'package.json',
        title: `Repository gate failed: ${spec.script}`,
        evidence: toEvidence(execution.outputTail || `exit code ${execution.exitCode}`, 1000),
        impact: spec.impact,
        deterministic_evidence: [
          {
            source_type: 'repo-check',
            rule_id: spec.script,
            summary: toEvidence(execution.outputTail || `exit code ${execution.exitCode}`, 200),
          },
        ],
      },
    ],
  };
}

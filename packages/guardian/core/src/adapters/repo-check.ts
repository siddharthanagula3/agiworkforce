/**
 * Generic adapter for repository-owned check scripts (`pnpm check:*`).
 *
 * These scripts are the repository's own invariant guards (trust boundaries,
 * model catalog, tenant isolation, LLM failure guards, …). They communicate
 * through exit codes and human-readable output, so the adapter maps:
 *   exit 0            → clean
 *   nonzero, ran      → one finding carrying the output tail as evidence
 *   spawn/other error → scanner-failed (never reported as clean)
 */
import { toEvidence, type AdapterOutcome } from './types.js';
import type { FindingCategory, Severity } from '../schema.js';

export interface RepoCheckSpec {
  /** Root package.json script name, e.g. "check:trust-boundaries". */
  script: string;
  category: FindingCategory;
  severity: Severity;
  /** One-line statement of what a failure means for the product. */
  impact: string;
}

export interface RepoCheckExecution {
  exitCode: number | null;
  /** Combined stdout+stderr tail, already truncated by the runner. */
  outputTail: string;
  /** True when the process failed to spawn or was killed by a timeout. */
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

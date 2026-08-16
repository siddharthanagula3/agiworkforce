import { z } from 'zod';

import { toEvidence, type AdapterOutcome, type RawFinding } from './types.js';
import type { Severity } from '../schema.js';

const SemgrepResultSchema = z.object({
  check_id: z.string(),
  path: z.string(),
  start: z.object({ line: z.number().int() }),
  end: z.object({ line: z.number().int() }),
  extra: z.object({
    message: z.string(),
    severity: z.string().optional().default('WARNING'),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
  }),
});

const SemgrepOutputSchema = z.object({
  results: z.array(SemgrepResultSchema),
  errors: z
    .array(z.object({ message: z.string().optional() }))
    .optional()
    .default([]),
});

function mapSeverity(semgrepSeverity: string, metadata: Record<string, unknown>): Severity {
  const confidence = typeof metadata['confidence'] === 'string' ? metadata['confidence'] : '';
  switch (semgrepSeverity.toUpperCase()) {
    case 'ERROR':
      return confidence.toUpperCase() === 'HIGH' ? 'high' : 'medium';
    case 'WARNING':
      return 'medium';
    default:
      return 'low';
  }
}

export function parseSemgrepOutput(jsonText: string): AdapterOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    return {
      status: 'scanner-failed',
      findings: [],
      error: `unparseable semgrep output: ${String(error)}`,
    };
  }
  const result = SemgrepOutputSchema.safeParse(parsed);
  if (!result.success) {
    return {
      status: 'scanner-failed',
      findings: [],
      error: 'semgrep output did not match the JSON shape',
    };
  }

  const findings: RawFinding[] = result.data.results.map((r) => {
    const isSecurity =
      r.check_id.includes('security') ||
      typeof r.extra.metadata['cwe'] !== 'undefined' ||
      typeof r.extra.metadata['owasp'] !== 'undefined';
    return {
      rule_id: `semgrep/${r.check_id}`,
      source: 'semgrep',
      source_type: 'semgrep',
      category: isSecurity ? 'security' : 'correctness',
      severity: mapSeverity(r.extra.severity, r.extra.metadata),
      confidence: 0.9,
      path: r.path,
      start_line: r.start.line > 0 ? r.start.line : null,
      end_line: r.end.line > 0 ? r.end.line : null,
      title: `Semgrep: ${r.check_id.split('.').pop() ?? r.check_id}`,
      evidence: toEvidence(r.extra.message),
      impact: isSecurity
        ? 'Pattern matches a known insecure construct.'
        : 'Pattern matches a known defect-prone construct.',
      deterministic_evidence: [
        { source_type: 'semgrep', rule_id: r.check_id, summary: toEvidence(r.extra.message, 200) },
      ],
    };
  });

  return { status: findings.length > 0 ? 'findings' : 'clean', findings };
}

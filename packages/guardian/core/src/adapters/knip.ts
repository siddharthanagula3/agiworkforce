import { z } from 'zod';

import { toEvidence, type AdapterOutcome, type RawFinding } from './types.js';

const KnipIssueSchema = z.object({
  file: z.string(),
  dependencies: z.array(z.object({ name: z.string() })).optional(),
  devDependencies: z.array(z.object({ name: z.string() })).optional(),
  exports: z.array(z.object({ name: z.string(), line: z.number().optional() })).optional(),
  types: z.array(z.object({ name: z.string(), line: z.number().optional() })).optional(),
});

const KnipReportSchema = z.object({
  files: z.array(z.string()).optional(),
  issues: z.array(KnipIssueSchema).optional(),
});

export function parseKnipOutput(jsonText: string): AdapterOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    return {
      status: 'scanner-failed',
      findings: [],
      error: `unparseable knip output: ${String(error)}`,
    };
  }
  const result = KnipReportSchema.safeParse(parsed);
  if (!result.success) {
    return {
      status: 'scanner-failed',
      findings: [],
      error: 'knip output did not match the JSON reporter shape',
    };
  }

  const findings: RawFinding[] = [];
  for (const file of result.data.files ?? []) {
    findings.push({
      rule_id: 'knip/unused-file',
      source: 'knip',
      source_type: 'knip',
      category: 'technical-debt',
      subcategory: 'unused-code',
      severity: 'low',
      confidence: 0.9,
      path: file,
      title: 'Unused file',
      evidence: toEvidence(`knip found no references to ${file}`),
      impact: 'Dead files add maintenance surface and hide the live implementation.',
    });
  }
  for (const issue of result.data.issues ?? []) {
    for (const dep of [...(issue.dependencies ?? []), ...(issue.devDependencies ?? [])]) {
      findings.push({
        rule_id: 'knip/unused-dependency',
        source: 'knip',
        source_type: 'knip',
        category: 'technical-debt',
        subcategory: 'unused-dependency',
        severity: 'low',
        confidence: 0.85,
        path: issue.file,
        symbol: dep.name,
        title: `Unused dependency: ${dep.name}`,
        evidence: toEvidence(`knip found no imports of ${dep.name} declared in ${issue.file}`),
        impact: 'Unused dependencies inflate install size and supply-chain exposure.',
      });
    }
    for (const exp of [...(issue.exports ?? []), ...(issue.types ?? [])]) {
      findings.push({
        rule_id: 'knip/unused-export',
        source: 'knip',
        source_type: 'knip',
        category: 'technical-debt',
        subcategory: 'unused-code',
        severity: 'info',
        confidence: 0.8,
        path: issue.file,
        start_line: exp.line ?? null,
        symbol: exp.name,
        title: `Unused export: ${exp.name}`,
        evidence: toEvidence(`knip found no references to export ${exp.name} in ${issue.file}`),
        impact: 'Unused exports suggest dead or partially wired features.',
      });
    }
  }
  return { status: findings.length > 0 ? 'findings' : 'clean', findings };
}

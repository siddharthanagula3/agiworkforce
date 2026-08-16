/**
 * ESLint JSON formatter adapter (`eslint --format json`).
 */
import { z } from 'zod';

import { toEvidence, type AdapterOutcome, type RawFinding } from './types.js';

const EslintMessageSchema = z.object({
  ruleId: z.string().nullable(),
  severity: z.number().int().min(0).max(2),
  message: z.string(),
  line: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  fatal: z.boolean().optional(),
});

const EslintResultSchema = z.array(
  z.object({
    filePath: z.string(),
    messages: z.array(EslintMessageSchema),
  }),
);

export function parseEslintOutput(jsonText: string, repoRoot: string): AdapterOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    return {
      status: 'scanner-failed',
      findings: [],
      error: `unparseable ESLint output: ${String(error)}`,
    };
  }
  const result = EslintResultSchema.safeParse(parsed);
  if (!result.success) {
    return {
      status: 'scanner-failed',
      findings: [],
      error: 'ESLint output did not match the JSON formatter shape',
    };
  }

  const findings: RawFinding[] = [];
  for (const file of result.data) {
    const relative = file.filePath.startsWith(repoRoot)
      ? file.filePath.slice(repoRoot.length).replace(/^\/+/, '')
      : file.filePath;
    for (const message of file.messages) {
      if (message.severity < 2 && message.fatal !== true) continue;
      findings.push({
        rule_id: `eslint/${message.ruleId ?? 'fatal'}`,
        source: 'eslint',
        source_type: 'eslint',
        category: 'correctness',
        severity: message.fatal ? 'high' : 'medium',
        confidence: 1,
        path: relative,
        start_line: message.line ?? null,
        end_line: message.endLine ?? message.line ?? null,
        title: `ESLint: ${message.ruleId ?? 'parse error'}`,
        evidence: toEvidence(message.message),
        impact: 'Lint errors block the repository lint gate and often indicate real defects.',
        deterministic_evidence: [
          {
            source_type: 'eslint',
            rule_id: message.ruleId ?? 'fatal',
            summary: toEvidence(message.message),
          },
        ],
      });
    }
  }
  return { status: findings.length > 0 ? 'findings' : 'clean', findings };
}

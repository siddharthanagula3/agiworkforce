import { redactWithPolicy } from '@agiworkforce/utils/secret-redaction';

import type { DeterministicEvidence, FindingCategory, Severity, SourceType } from '../schema.js';

export interface RawFinding {
  rule_id: string;
  source: string;
  source_type: SourceType;
  category: FindingCategory;
  subcategory?: string | null;
  severity: Severity;
  confidence: number;
  path: string;
  start_line?: number | null;
  end_line?: number | null;
  symbol?: string | null;
  title: string;
  evidence: string;
  impact: string;
  failure_scenario?: string | null;
  suggested_fix?: string | null;
  deterministic_evidence?: DeterministicEvidence[];
}

export interface AdapterOutcome {
  status: 'clean' | 'findings' | 'scanner-failed';
  findings: RawFinding[];
  error?: string;
}

export function redactEvidence(text: string): string {
  return redactWithPolicy(text, 'evidence');
}

export function toEvidence(text: string, maxLength = 500): string {
  const collapsed = redactEvidence(text).replace(/\s+/g, ' ').trim();
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1)}…` : collapsed;
}

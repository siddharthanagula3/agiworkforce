import { SEVERITY_WEIGHT, type Finding } from './schema.js';

export function findingScore(finding: Finding): number {
  let score = SEVERITY_WEIGHT[finding.severity] * 1000;
  score += Math.round(finding.confidence * 100);
  if (finding.is_new) score += 250;
  if (finding.is_in_diff) score += 150;
  if (finding.deterministic_evidence.length > 0) score += 200;
  if (finding.exploitability === 'confirmed') score += 300;
  if (finding.reachability === 'reachable') score += 100;
  return score;
}

export function rankFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const diff = findingScore(b) - findingScore(a);
    if (diff !== 0) return diff;
    return a.fingerprint.localeCompare(b.fingerprint);
  });
}

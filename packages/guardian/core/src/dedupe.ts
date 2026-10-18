import { SEVERITY_WEIGHT, type Finding } from './schema.js';

export function dedupeFindings(findings: readonly Finding[]): Finding[] {
  const byFingerprint = new Map<string, Finding>();
  for (const finding of findings) {
    const existing = byFingerprint.get(finding.fingerprint);
    if (!existing) {
      byFingerprint.set(finding.fingerprint, finding);
      continue;
    }
    const winner = stronger(existing, finding);
    const loser = winner === existing ? finding : existing;
    const mergedEvidence = [...winner.deterministic_evidence];
    for (const ev of loser.deterministic_evidence) {
      if (
        !mergedEvidence.some((e) => e.rule_id === ev.rule_id && e.source_type === ev.source_type)
      ) {
        mergedEvidence.push(ev);
      }
    }
    byFingerprint.set(finding.fingerprint, { ...winner, deterministic_evidence: mergedEvidence });
  }
  return [...byFingerprint.values()];
}

function stronger(a: Finding, b: Finding): Finding {
  if (SEVERITY_WEIGHT[a.severity] !== SEVERITY_WEIGHT[b.severity]) {
    return SEVERITY_WEIGHT[a.severity] > SEVERITY_WEIGHT[b.severity] ? a : b;
  }
  if (a.confidence !== b.confidence) return a.confidence > b.confidence ? a : b;
  if (a.source_type !== 'llm' && b.source_type === 'llm') return a;
  if (b.source_type !== 'llm' && a.source_type === 'llm') return b;
  return a;
}

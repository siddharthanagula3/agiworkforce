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

export interface Reconciliation {
  fixed: Finding[];
  persisting: Finding[];
  introduced: Finding[];
}

export function reconcileRuns(
  previous: readonly Finding[],
  current: readonly Finding[],
): Reconciliation {
  const currentByFp = new Map(current.map((f) => [f.fingerprint, f]));
  const previousFps = new Set(previous.map((f) => f.fingerprint));

  const fixed = previous
    .filter((f) => !currentByFp.has(f.fingerprint) && f.status === 'open')
    .map((f) => ({ ...f, status: 'fixed' as const }));
  const persisting = current
    .filter((f) => previousFps.has(f.fingerprint))
    .map((f) => ({ ...f, is_new: false }));
  const introduced = current
    .filter((f) => !previousFps.has(f.fingerprint))
    .map((f) => ({ ...f, is_new: true }));

  return { fixed, persisting, introduced };
}

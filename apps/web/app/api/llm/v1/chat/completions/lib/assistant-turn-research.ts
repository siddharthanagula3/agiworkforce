/**
 * @file The research activity a finished Deep Research turn has to keep.
 *
 * The run's report is already durable in `research_reports`, keyed by the same
 * `request_id` the assistant turn's metadata carries, so the row and the report
 * were always two halves of one turn. What the message row never held was the
 * state the activity header renders from, and the client save that carried it
 * is the one write a research turn is most likely to lose: its metadata is the
 * largest of any turn (plan steps, sources and reasoning together), so it is
 * the one that trips the metadata size limit and answers 400. The turn then
 * reloaded as plain prose with no header, no phase and no step list, while the
 * report sat untouched in its own table.
 *
 * So the state is projected here from the stored report rather than re-derived
 * from the wire: the report is what the loop persisted, and a second derivation
 * would be free to disagree with it. Only the fields the header actually reads
 * are projected. The phase label is not, because `ResearchActivity` already
 * owns a label per phase and a copy here would drift from it.
 *
 * @module chat/completions/assistant-turn-research
 */

import 'server-only';

import type { ResearchStep } from '@agiworkforce/types';
import type { PersistedResearchReport } from '@/lib/services/research-report-service';

/** The `MessageResearchState` fields a reloaded run can be rebuilt from. */
export interface PersistedTurnResearch {
  phase: 'complete' | 'error' | 'interrupted';
  sources: number;
  steps?: ResearchStep[];
  elapsedMs?: number;
  error?: string;
}

/** Well past the step count a bounded run plans, and still a bound on the row. */
export const MAX_PERSISTED_TURN_RESEARCH_STEPS = 50;

/**
 * A run that stopped before its report was written is `interrupted`, a run that
 * wrote one is `complete`, and every remaining status reached the row by way of
 * a failure the header must show as one.
 */
function phaseOf(report: PersistedResearchReport): PersistedTurnResearch['phase'] {
  if (report.status === 'completed') return 'complete';
  if (report.status === 'interrupted') return 'interrupted';
  return 'error';
}

export function buildPersistedTurnResearch(report: PersistedResearchReport): PersistedTurnResearch {
  const research: PersistedTurnResearch = {
    phase: phaseOf(report),
    sources: Math.max(0, Math.trunc(report.sourcesConsulted)),
  };
  const steps = (report.steps ?? []).slice(0, MAX_PERSISTED_TURN_RESEARCH_STEPS);
  if (steps.length > 0) research.steps = steps;
  if (typeof report.totalDurationMs === 'number' && Number.isFinite(report.totalDurationMs)) {
    research.elapsedMs = Math.max(0, Math.trunc(report.totalDurationMs));
  }
  if (report.error) research.error = report.error;
  return research;
}

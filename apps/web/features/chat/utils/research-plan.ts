import { isResearchStep, type ResearchStep } from '@agiworkforce/types';

/**
 * Client-side reduction of the additive `x_research_plan` SSE event
 * (CAP-045 slice 2).
 *
 * The server re-emits the WHOLE plan on every change (last-write-wins, like
 * `x_search_results`), so reduction is a replace, not a merge — a client that
 * joined late still ends up with the complete queue.
 *
 * Every field is validated: the payload is model-influenced server output
 * arriving over the wire, so a malformed step is dropped rather than rendered.
 * A payload with no usable step returns null, which callers treat as "no
 * update" so a garbage event cannot erase a good plan.
 */
export function parseResearchPlanEvent(payload: unknown): ResearchStep[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const rawSteps = (payload as { steps?: unknown }).steps;
  if (!Array.isArray(rawSteps)) return null;

  const steps: ResearchStep[] = [];
  const seenIds = new Set<string>();
  for (const raw of rawSteps) {
    if (!raw || typeof raw !== 'object') continue;
    const wire = raw as Record<string, unknown>;
    const candidate: Record<string, unknown> = {
      id: wire['id'],
      type: wire['type'],
      description: wire['description'],
      status: wire['status'],
    };
    if (!isResearchStep(candidate)) continue;
    if (seenIds.has(candidate['id'] as string)) continue;
    seenIds.add(candidate['id'] as string);

    const step = candidate as unknown as ResearchStep;
    if (typeof wire['started_at'] === 'string') step.startedAt = wire['started_at'];
    if (typeof wire['completed_at'] === 'string') step.completedAt = wire['completed_at'];
    if (typeof wire['duration_ms'] === 'number' && Number.isFinite(wire['duration_ms'])) {
      step.durationMs = Math.max(0, wire['duration_ms']);
    }
    if (
      typeof wire['sources_consulted'] === 'number' &&
      Number.isFinite(wire['sources_consulted'])
    ) {
      step.sourcesConsulted = Math.max(0, wire['sources_consulted']);
    }
    steps.push(step);
    // Bound: the loop emits at most a handful of steps, but the wire is not
    // trusted to stay that way.
    if (steps.length >= 50) break;
  }

  return steps.length > 0 ? steps : null;
}

/**
 * The queries a retry should NOT re-run: search steps a previous attempt
 * actually completed. Used to build the `research_resume` payload.
 */
export function completedResearchSteps(steps: ResearchStep[] | undefined): ResearchStep[] {
  return (steps ?? []).filter((step) => step.status === 'completed' && step.type === 'search');
}

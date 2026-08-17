import { isResearchStep, type ResearchStep } from '@agiworkforce/types';

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
    if (steps.length >= 50) break;
  }

  return steps.length > 0 ? steps : null;
}

export function completedResearchSteps(steps: ResearchStep[] | undefined): ResearchStep[] {
  return (steps ?? []).filter((step) => step.status === 'completed' && step.type === 'search');
}

/** The plan steps a paused run is offering: what pressing Start commits to. */
export function approvedResearchSteps(steps: ResearchStep[] | undefined): ResearchStep[] {
  return (steps ?? []).filter((step) => step.status === 'pending' && step.type === 'search');
}

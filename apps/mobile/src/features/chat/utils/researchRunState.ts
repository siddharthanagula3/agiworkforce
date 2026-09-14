import { isResearchStep, type ResearchStep } from '@agiworkforce/types';
import type { StreamDelta } from '@/services/streaming';
import type { ToolSearchResult } from '@/types/chat';

export type ResearchPhase =
  | 'planning'
  | 'awaiting_approval'
  | 'searching'
  | 'synthesizing'
  | 'complete'
  | 'error'
  | 'interrupted';

export const RESEARCH_PHASES: readonly ResearchPhase[] = [
  'planning',
  'awaiting_approval',
  'searching',
  'synthesizing',
  'complete',
  'error',
  'interrupted',
];

export interface ResearchRunState {
  phase: ResearchPhase;
  label?: string;
  iteration?: number;
  maxIterations?: number;
  searches?: number;
  maxSearches?: number;
  sources?: number;
  elapsedMs?: number;
  startedAt?: string;
  error?: string;
  steps?: ResearchStep[];
  sourcesForRetry?: ToolSearchResult[];
}

export const RESEARCH_PHASE_LABELS: Record<ResearchPhase, string> = {
  planning: 'Planning research',
  awaiting_approval: 'Review the plan to start searching',
  searching: 'Searching the web',
  synthesizing: 'Writing report',
  complete: 'Research complete',
  error: 'Research failed',
  interrupted: 'Research stopped',
};

const MAX_RETRY_SOURCES = 100;
const MAX_PLAN_STEPS = 50;
const MAX_STEP_NOTE_CHARS = 300;

function readCount(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

function readResearchStatus(
  payload: unknown,
  prev: ResearchRunState | undefined,
  nowIso: string,
): ResearchRunState | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const raw = payload as Record<string, unknown>;
  const phase = raw['phase'];
  if (!RESEARCH_PHASES.includes(phase as ResearchPhase)) return null;
  const label = typeof raw['label'] === 'string' && raw['label'] ? raw['label'] : undefined;

  const next: ResearchRunState = {
    ...(prev ?? {}),
    phase: phase as ResearchPhase,
    startedAt: prev?.startedAt ?? nowIso,
  };
  if (label) next.label = label;
  const iteration = readCount(raw, 'iteration');
  if (iteration !== undefined) next.iteration = iteration;
  const maxIterations = readCount(raw, 'max_iterations');
  if (maxIterations !== undefined) next.maxIterations = maxIterations;
  const searches = readCount(raw, 'searches');
  if (searches !== undefined) next.searches = searches;
  const maxSearches = readCount(raw, 'max_searches');
  if (maxSearches !== undefined) next.maxSearches = maxSearches;
  const sources = readCount(raw, 'sources');
  if (sources !== undefined) next.sources = sources;
  const elapsedMs = readCount(raw, 'elapsed_ms');
  if (elapsedMs !== undefined) next.elapsedMs = elapsedMs;
  if (phase === 'error') next.error = label ?? 'Research run failed';
  else delete next.error;
  return next;
}

export function parseResearchPlanSteps(payload: unknown): ResearchStep[] | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const rawSteps = (payload as { steps?: unknown }).steps;
  if (!Array.isArray(rawSteps)) return null;

  const steps: ResearchStep[] = [];
  const seen = new Set<string>();
  for (const raw of rawSteps) {
    if (!raw || typeof raw !== 'object') continue;
    const wire = raw as Record<string, unknown>;
    const candidate = {
      id: wire['id'],
      type: wire['type'],
      description: wire['description'],
      status: wire['status'],
    };
    if (!isResearchStep(candidate)) continue;
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const step: ResearchStep = { ...candidate };
    if (typeof wire['started_at'] === 'string') step.startedAt = wire['started_at'];
    if (typeof wire['completed_at'] === 'string') step.completedAt = wire['completed_at'];
    const duration = readCount(wire, 'duration_ms');
    if (duration !== undefined) step.durationMs = duration;
    const sourcesConsulted = readCount(wire, 'sources_consulted');
    if (sourcesConsulted !== undefined) step.sourcesConsulted = sourcesConsulted;
    if (typeof wire['note'] === 'string' && wire['note'].trim()) {
      step.note = wire['note'].slice(0, MAX_STEP_NOTE_CHARS);
    }
    steps.push(step);
    if (steps.length >= MAX_PLAN_STEPS) break;
  }
  return steps.length > 0 ? steps : null;
}

export function parseResearchSearchSources(payload: unknown): ToolSearchResult[] {
  if (!payload || typeof payload !== 'object') return [];
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  const results: ToolSearchResult[] = [];
  for (const entry of content as Record<string, unknown>[]) {
    if (entry['type'] !== 'web_search_result') continue;
    const url = entry['url'];
    if (typeof url !== 'string' || !url) continue;
    const title = typeof entry['title'] === 'string' && entry['title'] ? entry['title'] : url;
    const snippet = typeof entry['snippet'] === 'string' ? entry['snippet'] : undefined;
    results.push({ url, title, ...(snippet ? { snippet } : {}) });
  }
  return results;
}

export function mergeResearchSources(
  existing: ToolSearchResult[] | undefined,
  incoming: ToolSearchResult[],
): ToolSearchResult[] {
  const merged: ToolSearchResult[] = [];
  const seen = new Set<string>();
  for (const source of [...(existing ?? []), ...incoming]) {
    if (seen.has(source.url)) continue;
    seen.add(source.url);
    merged.push(source);
    if (merged.length >= MAX_RETRY_SOURCES) break;
  }
  return merged;
}

export function reduceResearchDelta(
  prev: ResearchRunState | undefined,
  delta: StreamDelta,
  nowIso: string = new Date().toISOString(),
): ResearchRunState | null {
  const wire = delta as {
    x_research_status?: unknown;
    x_research_plan?: unknown;
    x_search_results?: unknown;
  };

  let next = readResearchStatus(wire.x_research_status, prev, nowIso) ?? prev;

  const steps = parseResearchPlanSteps(wire.x_research_plan);
  if (steps) {
    next = { ...(next ?? { phase: 'planning', startedAt: nowIso }), steps };
  }

  if (next && wire.x_search_results !== undefined) {
    const incoming = parseResearchSearchSources(wire.x_search_results);
    if (incoming.length > 0) {
      next = { ...next, sourcesForRetry: mergeResearchSources(next.sourcesForRetry, incoming) };
    }
  }

  return next && next !== prev ? next : null;
}

export function settleResearchRun(
  prev: ResearchRunState | undefined,
  phase: 'interrupted' | 'error',
  error?: string,
): ResearchRunState | null {
  if (!prev) return null;
  if (prev.phase === 'complete' || prev.phase === 'interrupted' || prev.phase === 'error') {
    return null;
  }
  const next: ResearchRunState = { ...prev, phase, label: RESEARCH_PHASE_LABELS[phase] };
  if (phase === 'error') next.error = error ?? RESEARCH_PHASE_LABELS.error;
  return next;
}

export function readResearchRunState(value: unknown): ResearchRunState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (!RESEARCH_PHASES.includes(raw['phase'] as ResearchPhase)) return undefined;
  return raw as unknown as ResearchRunState;
}

export function completedResearchSteps(steps: ResearchStep[] | undefined): ResearchStep[] {
  return (steps ?? []).filter((step) => step.status === 'completed' && step.type === 'search');
}

export function approvedResearchSteps(steps: ResearchStep[] | undefined): ResearchStep[] {
  return (steps ?? []).filter((step) => step.status === 'pending' && step.type === 'search');
}

export function isResearchRunActive(research: ResearchRunState | undefined): boolean {
  if (!research) return false;
  return (
    research.phase === 'planning' ||
    research.phase === 'searching' ||
    research.phase === 'synthesizing'
  );
}

export function isResearchRunResumable(research: ResearchRunState | undefined): boolean {
  return research?.phase === 'error' || research?.phase === 'interrupted';
}

export function researchResumePayload(research: ResearchRunState): {
  sources: ToolSearchResult[];
  steps: ResearchStep[];
  approvedSteps: ResearchStep[];
} {
  return {
    sources: research.sourcesForRetry ?? [],
    steps: completedResearchSteps(research.steps),
    approvedSteps: approvedResearchSteps(research.steps),
  };
}

export function formatResearchElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function researchCountsSummary(research: ResearchRunState): string[] {
  const counts: string[] = [];
  const active = isResearchRunActive(research);
  if (active && (research.iteration ?? 0) > 0 && (research.maxIterations ?? 0) > 0) {
    counts.push(`round ${research.iteration} of ${research.maxIterations}`);
  }
  const searches = research.searches ?? 0;
  if (searches > 0) {
    const noun = `search${searches === 1 ? '' : 'es'}`;
    counts.push(
      active && (research.maxSearches ?? 0) > 0
        ? `${searches} of ${research.maxSearches} ${noun}`
        : `${searches} ${noun}`,
    );
  }
  const sources = research.sources ?? 0;
  if (sources > 0) counts.push(`${sources} source${sources === 1 ? '' : 's'}`);
  return counts;
}

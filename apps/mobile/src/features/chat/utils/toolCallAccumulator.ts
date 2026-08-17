import { isResearchStep, type ResearchStep } from '@agiworkforce/types';
import type { ToolCall } from '@/types/chat';
import type { StreamDelta } from '@/services/streaming';

export type ResearchPhase = 'planning' | 'searching' | 'synthesizing' | 'complete' | 'error';

export interface ResearchProgress {
  phase: ResearchPhase;
  label?: string;
  iteration?: number;
  maxIterations?: number;
  searches?: number;
  maxSearches?: number;
  sources?: number;
  elapsedMs?: number;
  steps?: ResearchStep[];
}

export interface ToolCallAccumulator {
  byKey: Map<string, ToolCall>;
  order: string[];
  indexToKey: Map<number, string>;
  nameToKey: Map<string, string>;
  idToKey: Map<string, string>;
  lastKey: string | null;
  research: ResearchProgress | null;
}

// The server never sends a `deep_research` tool call; the research row is
// synthesized from x_research_status/x_research_plan so the run shows up in the
// same timeline the rest of the activity renders in.
export const RESEARCH_TOOL_KEY = 'research:deep_research';
export const RESEARCH_TOOL_NAME = 'deep_research';

export function createToolCallAccumulator(): ToolCallAccumulator {
  return {
    byKey: new Map(),
    order: [],
    indexToKey: new Map(),
    nameToKey: new Map(),
    idToKey: new Map(),
    lastKey: null,
    research: null,
  };
}

export function seedToolCallAccumulator(existing: ToolCall[]): ToolCallAccumulator {
  const acc = createToolCallAccumulator();
  for (const tool of existing) {
    const key = tool.id;
    acc.byKey.set(key, { ...tool });
    acc.order.push(key);
    if (tool.toolCallId) acc.idToKey.set(tool.toolCallId, key);
    if (tool.name) acc.nameToKey.set(tool.name, key);
  }
  return acc;
}

function mapStatus(status?: string): ToolCall['status'] {
  if (status === 'completed') return 'completed';
  if (status === 'failed' || status === 'error') return 'failed';
  return 'running';
}

function ensure(acc: ToolCallAccumulator, key: string, defaults: Partial<ToolCall>): ToolCall {
  let t = acc.byKey.get(key);
  if (!t) {
    t = { id: key, name: defaults.name ?? '', status: defaults.status ?? 'running' };
    acc.byKey.set(key, t);
    acc.order.push(key);
  }
  return t;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const RESEARCH_PHASES: readonly ResearchPhase[] = [
  'planning',
  'searching',
  'synthesizing',
  'complete',
  'error',
];

const RESEARCH_PHASE_LABELS: Record<ResearchPhase, string> = {
  planning: 'Planning research',
  searching: 'Searching the web',
  synthesizing: 'Writing report',
  complete: 'Research complete',
  error: 'Research failed',
};

const STEP_MARKERS: Record<ResearchStep['status'], string> = {
  pending: '·',
  running: '▸',
  completed: '✓',
  failed: '✕',
};

function readCount(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

function readResearchStatus(
  payload: unknown,
  prev: ResearchProgress | null,
): ResearchProgress | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const raw = payload as Record<string, unknown>;
  const phase = raw['phase'];
  if (!RESEARCH_PHASES.includes(phase as ResearchPhase)) return null;
  return {
    ...(prev ?? {}),
    phase: phase as ResearchPhase,
    ...(typeof raw['label'] === 'string' && raw['label'] ? { label: raw['label'] } : {}),
    iteration: readCount(raw, 'iteration') ?? prev?.iteration,
    maxIterations: readCount(raw, 'max_iterations') ?? prev?.maxIterations,
    searches: readCount(raw, 'searches') ?? prev?.searches,
    maxSearches: readCount(raw, 'max_searches') ?? prev?.maxSearches,
    sources: readCount(raw, 'sources') ?? prev?.sources,
    elapsedMs: readCount(raw, 'elapsed_ms') ?? prev?.elapsedMs,
  };
}

function readResearchPlan(payload: unknown): ResearchStep[] | null {
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
    const duration = readCount(wire, 'duration_ms');
    if (duration !== undefined) step.durationMs = duration;
    const sources = readCount(wire, 'sources_consulted');
    if (sources !== undefined) step.sourcesConsulted = sources;
    steps.push(step);
    if (steps.length >= 50) break;
  }
  return steps.length > 0 ? steps : null;
}

export function formatResearchProgress(research: ResearchProgress): string {
  const lines = [research.label || RESEARCH_PHASE_LABELS[research.phase]];

  const counts: string[] = [];
  if ((research.iteration ?? 0) > 0 && (research.maxIterations ?? 0) > 0) {
    counts.push(`round ${research.iteration} of ${research.maxIterations}`);
  }
  const searches = research.searches ?? 0;
  if (searches > 0) {
    counts.push(
      (research.maxSearches ?? 0) > 0
        ? `${searches} of ${research.maxSearches} searches`
        : `${searches} search${searches === 1 ? '' : 'es'}`,
    );
  }
  const sources = research.sources ?? 0;
  if (sources > 0) counts.push(`${sources} source${sources === 1 ? '' : 's'}`);
  if (counts.length > 0) lines.push(counts.join(' · '));

  for (const step of research.steps ?? []) {
    lines.push(`${STEP_MARKERS[step.status]} ${step.description}`);
  }

  return lines.join('\n');
}

function researchToolStatus(phase: ResearchPhase): ToolCall['status'] {
  if (phase === 'complete') return 'completed';
  if (phase === 'error') return 'failed';
  return 'running';
}

export function accumulateToolCallDelta(acc: ToolCallAccumulator, delta: StreamDelta): boolean {
  let changed = false;

  const researchDelta = delta as {
    x_research_status?: unknown;
    x_research_plan?: unknown;
  };
  const nextStatus = readResearchStatus(researchDelta.x_research_status, acc.research);
  if (nextStatus) acc.research = nextStatus;
  const nextSteps = readResearchPlan(researchDelta.x_research_plan);
  if (nextSteps) {
    acc.research = { ...(acc.research ?? { phase: 'planning' }), steps: nextSteps };
  }
  if (nextStatus || nextSteps) {
    const research = acc.research as ResearchProgress;
    const t = ensure(acc, RESEARCH_TOOL_KEY, { name: RESEARCH_TOOL_NAME });
    t.name = RESEARCH_TOOL_NAME;
    t.status = researchToolStatus(research.phase);
    t.output = formatResearchProgress(research);
    if ((research.elapsedMs ?? 0) > 0) t.duration = research.elapsedMs;
    t.requiresApproval = false;
    changed = true;
  }

  const st = delta.x_tool_status;
  if (st?.name) {
    let key = acc.nameToKey.get(st.name);
    if (!key) {
      key = `name:${st.name}`;
      acc.nameToKey.set(st.name, key);
    }
    const t = ensure(acc, key, { name: st.name });
    t.name = st.name;
    t.status = mapStatus(st.status);
    if (st.args !== undefined && !t.input) t.input = safeStringify(st.args);
    t.requiresApproval = false;
    acc.lastKey = key;
    changed = true;
  }

  for (const frag of delta.tool_calls ?? []) {
    let key: string;
    if (frag.id) {
      key = `id:${frag.id}`;
      acc.idToKey.set(frag.id, key);
      acc.indexToKey.set(frag.index, key);
    } else {
      key = acc.indexToKey.get(frag.index) ?? acc.lastKey ?? `idx:${frag.index}`;
      acc.indexToKey.set(frag.index, key);
    }
    const t = ensure(acc, key, {});
    if (frag.function?.name) {
      t.name = frag.function.name;
      acc.nameToKey.set(frag.function.name, key);
    }
    if (frag.function?.arguments) {
      t.input = (t.input ?? '') + frag.function.arguments;
    }
    acc.lastKey = key;
    changed = true;
  }

  const resultBlock = delta.x_search_results ?? delta.x_code_result;
  if (resultBlock !== undefined && resultBlock !== null) {
    const tuid =
      typeof resultBlock === 'object'
        ? (resultBlock as { tool_use_id?: string }).tool_use_id
        : undefined;
    const key =
      (tuid ? acc.idToKey.get(tuid) : undefined) ?? acc.lastKey ?? `result:${acc.order.length}`;
    const t = ensure(acc, key, { name: delta.x_search_results ? 'web_search' : 'code_execution' });
    t.output = safeStringify(resultBlock);
    t.status = 'completed';

    if (delta.x_code_result) {
      const inner = (
        delta.x_code_result as {
          content?: { stdout?: string; stderr?: string; return_code?: number };
        }
      ).content;
      if (inner && (typeof inner.stdout === 'string' || typeof inner.stderr === 'string')) {
        const text = [inner.stdout, inner.stderr]
          .filter((s): s is string => typeof s === 'string' && s.length > 0)
          .join('\n');
        if (text) t.output = text;
        if (typeof inner.return_code === 'number' && inner.return_code !== 0) {
          t.status = 'failed';
        }
      }
    }

    if (delta.x_search_results) {
      const content = (delta.x_search_results as { content?: unknown }).content;
      if (Array.isArray(content)) {
        const results = (content as Record<string, unknown>[])
          .filter((r) => r['type'] === 'web_search_result' && typeof r['url'] === 'string')
          .map((r) => ({
            url: r['url'] as string,
            title: (r['title'] as string) || (r['url'] as string),
            snippet: typeof r['snippet'] === 'string' ? r['snippet'] : undefined,
          }));
        if (results.length > 0) t.searchResults = results;
      }
    }

    changed = true;
  }

  const r = delta.x_tool_result;
  if (r?.tool_call_id) {
    const key = acc.idToKey.get(r.tool_call_id) ?? `id:${r.tool_call_id}`;
    acc.idToKey.set(r.tool_call_id, key);
    const t = ensure(acc, key, { name: r.name ?? '' });
    if (r.name) t.name = r.name;
    t.output = safeStringify(r.content);
    t.status = r.is_error ? 'failed' : 'completed';
    t.requiresApproval = false;
    changed = true;
  }

  const appr = delta.x_tool_approval_request;
  if (appr?.tool_call_id) {
    const key = acc.idToKey.get(appr.tool_call_id) ?? `id:${appr.tool_call_id}`;
    acc.idToKey.set(appr.tool_call_id, key);
    const t = ensure(acc, key, { name: appr.name });
    if (appr.name) t.name = appr.name;
    if (appr.args !== undefined && !t.input) t.input = safeStringify(appr.args);
    t.status = 'running';
    t.requiresApproval = true;
    t.toolCallId = appr.tool_call_id;
    changed = true;
  }

  return changed;
}

export function toolCallList(acc: ToolCallAccumulator): ToolCall[] {
  return acc.order
    .map((k) => acc.byKey.get(k))
    .filter((t): t is ToolCall => t !== undefined && t.name.length > 0)
    .map((t) => ({ ...t }));
}

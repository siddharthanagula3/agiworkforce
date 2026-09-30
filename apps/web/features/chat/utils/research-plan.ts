import {
  isResearchStep,
  type AgentEventSource,
  normalizeResearchDeliverable,
  type ResearchRunConfig,
  type ResearchStep,
} from '@agiworkforce/types';
import type { Message } from '@shared/stores/web-chat-store';
import type { WebSearchResults } from '../types/message-metadata';

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
    // The reason a planned query was dropped. Without it the panel shows a
    // dropped step and no explanation, which reads as a bug rather than a call.
    if (typeof wire['note'] === 'string' && wire['note'].trim()) {
      step.note = wire['note'].slice(0, 300);
    }
    steps.push(step);
    if (steps.length >= 50) break;
  }

  return steps.length > 0 ? steps : null;
}

const MAX_RUN_CONFIG_ENTRIES = 32;

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .slice(0, MAX_RUN_CONFIG_ENTRIES);
}

export function parseResearchRunConfig(payload: unknown): ResearchRunConfig | null {
  if (!payload || typeof payload !== 'object') return null;
  const run = (payload as { run?: unknown }).run;
  if (!run || typeof run !== 'object') return null;
  const wire = run as Record<string, unknown>;
  return {
    sources: {
      files: wire['files'] === true,
      allowDomains: stringList(wire['allow_domains']),
      denyDomains: stringList(wire['deny_domains']),
      connectors: stringList(wire['connectors']),
    },
    deliverable: normalizeResearchDeliverable(wire['deliverable']),
  };
}

export function completedResearchSteps(steps: ResearchStep[] | undefined): ResearchStep[] {
  return (steps ?? []).filter(
    (step) => step.status === 'completed' && (step.type === 'search' || step.type === 'analyze'),
  );
}

export function isResearchGuidanceStep(step: ResearchStep): boolean {
  return step.type === 'analyze';
}

const MAX_CONTEXT_SOURCES = 100;

function searchResultList(
  searchResults: WebSearchResults | undefined,
): Array<{ url: string; title?: string }> {
  return Array.isArray(searchResults) ? searchResults : (searchResults?.results ?? []);
}

export function researchTurnHistoryContent(
  message: Pick<Message, 'role' | 'content' | 'metadata'>,
): string | null {
  const research = message.metadata?.research;
  if (message.role !== 'assistant' || !research || !message.content.trim()) return null;
  const sources = (research.sourcesForRetry ?? searchResultList(message.metadata?.searchResults))
    .filter((source) => source.url)
    .slice(0, MAX_CONTEXT_SOURCES);
  if (sources.length === 0) return null;
  return `${message.content}\n\nSources for the numbered citations above:\n${sources
    .map((source, index) => `[${index + 1}] ${source.title || source.url}, ${source.url}`)
    .join('\n')}`;
}

function isAbsoluteWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

type ResumeSource = Omit<AgentEventSource, 'title'> &
  Partial<Pick<AgentEventSource, 'title'>> & { retrievedAt?: string };

export function researchResumeSources(
  sourcesForRetry: ResumeSource[] | undefined,
  searchResults: WebSearchResults | undefined,
): ResumeSource[] {
  const gathered =
    sourcesForRetry ??
    (Array.isArray(searchResults) ? searchResults : (searchResults?.results ?? [])).map(
      (result) => {
        const retrievedAt = result.retrievedAt ?? result.provenance?.retrievedAt;
        return {
          url: result.url,
          title: result.title,
          snippet: result.snippet,
          ...(retrievedAt ? { retrievedAt } : {}),
        };
      },
    );
  return gathered.filter((source) => isAbsoluteWebUrl(source.url));
}

/** The plan steps a paused run is offering: what pressing Start commits to. */
export function approvedResearchSteps(steps: ResearchStep[] | undefined): ResearchStep[] {
  return (steps ?? []).filter((step) => step.status === 'pending' && step.type === 'search');
}

/** A paused run streams its plan and no prose; the plan is the turn's output, not an empty reply. */
export function rendersResearchPlan(
  research: { phase?: string; steps?: ResearchStep[] } | undefined,
): boolean {
  if (!research) return false;
  return research.phase === 'awaiting_approval' || (research.steps?.length ?? 0) > 0;
}

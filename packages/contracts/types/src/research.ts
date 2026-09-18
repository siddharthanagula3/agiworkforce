/**
 * Research Types
 *
 * Types for the AI research system that performs multi-step web research,
 * source aggregation, and report generation. Used by desktop research
 * agents, web research UI, and mobile research viewer.
 *
 * @module research
 * @packageDocumentation
 */

/**
 * A citation referencing an external source.
 *
 * Citations are attached to research reports and individual claims
 * to provide provenance and allow verification.
 *
 * @example
 * ```typescript
 * const citation: Citation = {
 *   id: 'cite-001',
 *   title: 'React Server Components RFC',
 *   url: 'https://github.com/reactjs/rfcs/pull/188',
 *   source: 'GitHub',
 *   snippet: 'Server Components allow rendering on the server...',
 *   accessedAt: '2026-03-15T10:00:00Z',
 *   relevance: 0.95,
 * };
 * ```
 */
export interface Citation {
  id: string;

  title: string;

  url: string;

  source?: string;

  snippet?: string;

  author?: string;

  publishedDate?: string;

  accessedAt: string;

  relevance?: number;
}

/**
 * A research query submitted to the research agent.
 *
 * @example
 * ```typescript
 * const query: ResearchQuery = {
 *   id: 'research-abc',
 *   query: 'What are the best practices for React Server Components in 2026?',
 *   depth: 'comprehensive',
 *   maxSources: 20,
 *   focusAreas: ['performance', 'data fetching', 'caching'],
 * };
 * ```
 */
export interface ResearchQuery {
  id: string;

  query: string;

  depth?: 'quick' | 'standard' | 'comprehensive';

  maxSources?: number;

  focusAreas?: string[];

  preferredDomains?: string[];

  excludedDomains?: string[];

  notBefore?: string;

  model?: string;

  provider?: string;
}

/**
 * Where a research run is allowed to read from. One run mixes any number of
 * them: sites, the account's own files, and connected apps.
 */
export const RESEARCH_SOURCE_KINDS = ['web', 'files', 'connector'] as const;
export type ResearchSourceKind = (typeof RESEARCH_SOURCE_KINDS)[number];

export interface ResearchSource {
  kind: ResearchSourceKind;
  /** A hostname for `web`, a connector id for `connector`, empty for `files`. */
  id: string;
  label: string;
  /** A site the run must never read. Only meaningful on a `web` source. */
  excluded?: boolean;
}

/** The selection as the chat request carries it. */
export interface ResearchSourceRequest {
  files: boolean;
  allowDomains: string[];
  denyDomains: string[];
  connectors: string[];
}

export const FILES_RESEARCH_SOURCE: ResearchSource = {
  kind: 'files',
  id: '',
  label: 'My files, chats and reports',
};

export function researchSourceKey(
  source: Pick<ResearchSource, 'kind' | 'id' | 'excluded'>,
): string {
  return `${source.kind}:${source.excluded ? 'not:' : ''}${source.id}`;
}

export function addResearchSource(
  sources: readonly ResearchSource[],
  source: ResearchSource,
): ResearchSource[] {
  const key = researchSourceKey(source);
  if (sources.some((existing) => researchSourceKey(existing) === key)) return [...sources];
  return [...sources, source];
}

export function removeResearchSource(
  sources: readonly ResearchSource[],
  key: string,
): ResearchSource[] {
  return sources.filter((source) => researchSourceKey(source) !== key);
}

/**
 * An empty selection is an unrestricted web run, which is what a reader who
 * answers nothing asked for. Adding one site narrows the run to it.
 */
export function researchSourceRequest(sources: readonly ResearchSource[]): ResearchSourceRequest {
  const request: ResearchSourceRequest = {
    files: false,
    allowDomains: [],
    denyDomains: [],
    connectors: [],
  };
  for (const source of sources) {
    if (source.kind === 'files') request.files = true;
    else if (source.kind === 'connector') request.connectors.push(source.id);
    else if (source.excluded) request.denyDomains.push(source.id);
    else request.allowDomains.push(source.id);
  }
  return request;
}

export interface ResearchStep {
  id: string;

  type: 'search' | 'read' | 'analyze' | 'synthesize' | 'verify';

  description: string;

  /**
   * `dropped` is a planned query the run decided not to run, with the reason in
   * {@link ResearchStep.note}. A plan step left `pending` says only that nobody
   * got to it; a report that finishes owes the reader the difference.
   */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'dropped';

  durationMs?: number;

  sourcesConsulted?: number;

  startedAt?: string;

  completedAt?: string;

  /** Why a step was dropped. Present only on a `dropped` step. */
  note?: string;
}

export type ResearchReportStatus =
  'pending' | 'researching' | 'synthesizing' | 'completed' | 'interrupted' | 'failed';

/** Every valid {@link ResearchReportStatus}, in lifecycle order. */
export const RESEARCH_REPORT_STATUSES: readonly ResearchReportStatus[] = [
  'pending',
  'researching',
  'synthesizing',
  'completed',
  'interrupted',
  'failed',
] as const;

export function isResearchReportStatus(value: unknown): value is ResearchReportStatus {
  return (
    typeof value === 'string' && (RESEARCH_REPORT_STATUSES as readonly string[]).includes(value)
  );
}

/** Every valid {@link ResearchStep} `status`. */
export const RESEARCH_STEP_STATUSES: readonly ResearchStep['status'][] = [
  'pending',
  'running',
  'completed',
  'failed',
  'dropped',
] as const;

/** Every valid {@link ResearchStep} `type`. */
export const RESEARCH_STEP_TYPES: readonly ResearchStep['type'][] = [
  'search',
  'read',
  'analyze',
  'synthesize',
  'verify',
] as const;

export function isResearchStep(value: unknown): value is ResearchStep {
  if (!value || typeof value !== 'object') return false;
  const step = value as Record<string, unknown>;
  return (
    typeof step['id'] === 'string' &&
    step['id'].length > 0 &&
    typeof step['description'] === 'string' &&
    (RESEARCH_STEP_TYPES as readonly string[]).includes(step['type'] as string) &&
    (RESEARCH_STEP_STATUSES as readonly string[]).includes(step['status'] as string)
  );
}

/**
 * A completed research report with findings and citations.
 *
 * @example
 * ```typescript
 * const report: ResearchReport = {
 *   id: 'report-abc',
 *   queryId: 'research-abc',
 *   title: 'React Server Components Best Practices (2026)',
 *   summary: 'Server Components have matured significantly...',
 *   content: '## Overview\n\nReact Server Components...',
 *   citations: [citation1, citation2],
 *   steps: [step1, step2, step3],
 *   status: 'completed',
 *   sourcesConsulted: 15,
 *   totalDurationMs: 45000,
 *   createdAt: '2026-03-15T10:00:00Z',
 *   completedAt: '2026-03-15T10:00:45Z',
 * };
 * ```
 */
export interface ResearchReport {
  id: string;

  queryId: string;

  title: string;

  summary: string;

  content: string;

  citations: Citation[];

  steps?: ResearchStep[];

  status: ResearchReportStatus;

  sourcesConsulted: number;

  totalDurationMs?: number;

  /** What the managed usage ledger settled for the run, in microUSD. */
  settledCostMicrousd?: number;

  keyFindings?: string[];

  error?: string;

  createdAt: string;

  completedAt?: string;

  userId?: string;

  conversationId?: string;

  requestId?: string;
}

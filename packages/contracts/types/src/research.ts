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
/**
 * What kind of thing was cited. A URL is where a source was found, not what it
 * is: a paper keeps its identity when the link moves, a news claim is only
 * checkable with its publication and dateline, and a citation into a document
 * is unverifiable without the page it is on. Flattening all three into a link
 * is what makes a citation impossible to follow a month later.
 */
export const PUBLIC_SOURCE_TYPES = [
  'web_page',
  'news_article',
  'academic_paper',
  'pdf_document',
] as const;

export type PublicSourceType = (typeof PUBLIC_SOURCE_TYPES)[number];

/**
 * The locator that survives the link. Each variant carries only what its own
 * kind of source is identified by, so a missing one is a gap the reader can
 * see rather than an empty string that reads as an answer.
 */
export type PublicSourceLocator =
  | { readonly type: 'web_page'; readonly siteName?: string }
  | {
      readonly type: 'news_article';
      readonly publication: string;
      /** The dateline. A news claim without one cannot be checked against it. */
      readonly publishedDate: string;
      readonly section?: string;
    }
  | {
      readonly type: 'academic_paper';
      /** A DOI or an arXiv id. One of the two is what makes it findable. */
      readonly doi?: string;
      readonly arxivId?: string;
      readonly venue?: string;
      readonly peerReviewed?: boolean;
    }
  | {
      readonly type: 'pdf_document';
      /** One-based, as the document numbers its own pages for a reader. */
      readonly page?: number;
      readonly totalPages?: number;
    };

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

  /** Absent means nothing classified it, which is not the same as a web page. */
  locator?: PublicSourceLocator;
}

export function isPublicSourceType(value: string): value is PublicSourceType {
  return (PUBLIC_SOURCE_TYPES as readonly string[]).includes(value);
}

export function citationSourceType(citation: Citation): PublicSourceType | null {
  return citation.locator?.type ?? null;
}

/**
 * Whether the citation can be followed back to the same claim by someone else.
 * A paper needs an identifier that outlives the link, a news article needs the
 * publication and the day, and a document citation needs its page. A bare web
 * page is reproducible by its URL alone, which is all a web page ever has.
 */
export function citationIsReproducible(citation: Citation): boolean {
  const locator = citation.locator;
  if (locator === undefined) return citation.url.length > 0;
  switch (locator.type) {
    case 'academic_paper':
      return (locator.doi ?? locator.arxivId ?? '').length > 0;
    case 'news_article':
      return locator.publication.length > 0 && locator.publishedDate.length > 0;
    case 'pdf_document':
      return locator.page !== undefined && locator.page >= 1;
    case 'web_page':
      return citation.url.length > 0;
  }
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

/**
 * What the run is asked to produce, chosen before it starts rather than at
 * export time. It is also the run's stop rule: a deliverable that asks for
 * more sources is not done until it has them.
 */
export const RESEARCH_DELIVERABLE_DEPTHS = ['executive-summary', 'full-report'] as const;
export type ResearchDeliverableDepth = (typeof RESEARCH_DELIVERABLE_DEPTHS)[number];

export const RESEARCH_DELIVERABLE_FORMATS = ['prose', 'prose-with-tables', 'bullet-brief'] as const;
export type ResearchDeliverableFormat = (typeof RESEARCH_DELIVERABLE_FORMATS)[number];

export const RESEARCH_MAX_MIN_SOURCES = 40;

export interface ResearchDeliverableSpec {
  depth: ResearchDeliverableDepth;
  format: ResearchDeliverableFormat;
  /** Distinct sources the run must have before it may call itself done, 0 for no floor. */
  minSources: number;
  /** Stop gathering once a round adds no source the run did not already have. */
  stopWhenNoNewSources: boolean;
  /** Keep the finished report as its own library entry, not only in the chat. */
  saveToLibrary: boolean;
}

export const DEFAULT_RESEARCH_DELIVERABLE: ResearchDeliverableSpec = {
  depth: 'full-report',
  format: 'prose',
  minSources: 0,
  stopWhenNoNewSources: true,
  saveToLibrary: false,
};

export function normalizeResearchDeliverable(value: unknown): ResearchDeliverableSpec {
  if (!value || typeof value !== 'object') return { ...DEFAULT_RESEARCH_DELIVERABLE };
  const raw = value as Record<string, unknown>;
  const depth = (RESEARCH_DELIVERABLE_DEPTHS as readonly string[]).includes(raw['depth'] as string)
    ? (raw['depth'] as ResearchDeliverableDepth)
    : DEFAULT_RESEARCH_DELIVERABLE.depth;
  const format = (RESEARCH_DELIVERABLE_FORMATS as readonly string[]).includes(
    raw['format'] as string,
  )
    ? (raw['format'] as ResearchDeliverableFormat)
    : DEFAULT_RESEARCH_DELIVERABLE.format;
  const requested = Number(raw['minSources']);
  return {
    depth,
    format,
    minSources: Number.isFinite(requested)
      ? Math.min(RESEARCH_MAX_MIN_SOURCES, Math.max(0, Math.floor(requested)))
      : DEFAULT_RESEARCH_DELIVERABLE.minSources,
    stopWhenNoNewSources:
      typeof raw['stopWhenNoNewSources'] === 'boolean'
        ? raw['stopWhenNoNewSources']
        : DEFAULT_RESEARCH_DELIVERABLE.stopWhenNoNewSources,
    saveToLibrary: raw['saveToLibrary'] === true,
  };
}

export const RESEARCH_GAP_STATUSES = ['open', 'closed'] as const;
export type ResearchGapStatus = (typeof RESEARCH_GAP_STATUSES)[number];

/**
 * Something the plan committed to that the report does not answer. Derived from
 * the plan against the finished report, never asserted by the model, so a gap
 * is evidence rather than a claim.
 */
export interface ResearchGap {
  id: string;
  /** The planned question this gap belongs to. */
  question: string;
  status: ResearchGapStatus;
  /** Why it is still open, or how it was closed. */
  reason: string;
}

export function isResearchGap(value: unknown): value is ResearchGap {
  if (!value || typeof value !== 'object') return false;
  const gap = value as Record<string, unknown>;
  return (
    typeof gap['id'] === 'string' &&
    gap['id'].length > 0 &&
    typeof gap['question'] === 'string' &&
    typeof gap['reason'] === 'string' &&
    (RESEARCH_GAP_STATUSES as readonly string[]).includes(gap['status'] as string)
  );
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

  /** What the run was asked to produce, recorded so a reader can judge it. */
  deliverable?: ResearchDeliverableSpec;

  /** Planned questions the finished report does not answer. */
  gaps?: ResearchGap[];

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

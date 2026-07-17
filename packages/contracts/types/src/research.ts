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

// ============================================================================
// Citation
// ============================================================================

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
  /** Unique citation identifier within the report. */
  id: string;

  /** Title of the cited source. */
  title: string;

  /** URL of the cited source. */
  url: string;

  /** Source domain or publication name (e.g., `"GitHub"`, `"MDN"`). */
  source?: string;

  /** Relevant text snippet from the source. */
  snippet?: string;

  /** Author or organization (if available). */
  author?: string;

  /** Publication date (if available). */
  publishedDate?: string;

  /** ISO 8601 timestamp when the source was accessed during research. */
  accessedAt: string;

  /** Relevance score (0.0 to 1.0) to the research query. */
  relevance?: number;
}

// ============================================================================
// Research Query
// ============================================================================

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
  /** Unique research query identifier. */
  id: string;

  /** The research question or topic. */
  query: string;

  /** Research depth level. */
  depth?: 'quick' | 'standard' | 'comprehensive';

  /** Maximum number of sources to consult. */
  maxSources?: number;

  /** Specific areas to focus the research on. */
  focusAreas?: string[];

  /** Domains to prefer or restrict to (e.g., `["github.com", "docs.anthropic.com"]`). */
  preferredDomains?: string[];

  /** Domains to exclude from research. */
  excludedDomains?: string[];

  /** Date range for source freshness (ISO 8601 date string). */
  notBefore?: string;

  /** Model to use for research synthesis. */
  model?: string;

  /** Provider for the research model. */
  provider?: string;
}

// ============================================================================
// Research Step
// ============================================================================

/**
 * A single step in the research process.
 *
 * Research reports track each step (search, read, analyze) for transparency.
 */
export interface ResearchStep {
  /** Step identifier. */
  id: string;

  /** Type of research action. */
  type: 'search' | 'read' | 'analyze' | 'synthesize' | 'verify';

  /** Human-readable description of this step. */
  description: string;

  /** Step execution status. */
  status: 'pending' | 'running' | 'completed' | 'failed';

  /** Duration of this step in milliseconds. */
  durationMs?: number;

  /** Sources consulted during this step. */
  sourcesConsulted?: number;

  /** ISO 8601 timestamp when the step started. */
  startedAt?: string;

  /** ISO 8601 timestamp when the step completed. */
  completedAt?: string;
}

// ============================================================================
// Research Report
// ============================================================================

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
  /** Unique report identifier. */
  id: string;

  /** Research query that produced this report. */
  queryId: string;

  /** Report title (generated from the research). */
  title: string;

  /** Executive summary of the findings. */
  summary: string;

  /** Full report content in markdown. */
  content: string;

  /** Citations for sources used in the report. */
  citations: Citation[];

  /** Research steps taken to produce the report. */
  steps?: ResearchStep[];

  /** Report generation status. */
  status: 'pending' | 'researching' | 'synthesizing' | 'completed' | 'failed';

  /** Total number of sources consulted. */
  sourcesConsulted: number;

  /** Total research duration in milliseconds. */
  totalDurationMs?: number;

  /** Key findings extracted from the research. */
  keyFindings?: string[];

  /** Error message if status is `'failed'`. */
  error?: string;

  /** ISO 8601 timestamp when the report was created. */
  createdAt: string;

  /** ISO 8601 timestamp when the report was completed. */
  completedAt?: string;

  /** User who requested the research. */
  userId?: string;
}

import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  isResearchReportStatus,
  isResearchStep,
  type Citation,
  type ResearchReport,
  type ResearchReportStatus,
  type ResearchStep,
} from '@agiworkforce/types';

const MAX_CONTENT_CHARS = 400_000;
const MAX_TITLE_CHARS = 500;
const MAX_SUMMARY_CHARS = 8_000;
const MAX_QUERY_CHARS = 8_000;
const MAX_ERROR_CHARS = 2_000;
const MAX_CITATIONS = 500;
const MAX_STEPS = 200;
const MAX_KEY_FINDINGS = 50;
const MAX_KEY_FINDING_CHARS = 1_000;

interface ResearchReportRow {
  id: string;
  user_id: string;
  request_id: string;
  conversation_id: string | null;
  query: string;
  title: string;
  summary: string;
  content: string;
  citations: unknown;
  steps: unknown;
  key_findings: unknown;
  status: string;
  sources_consulted: number | string;
  duration_ms: number | string | null;
  error: string | null;
  model: string | null;
  provider: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  completed_at: string | Date | null;
}

export interface SaveResearchReportInput {
  userId: string;
  requestId: string;
  conversationId?: string | null;
  query: string;
  title: string;
  summary: string;
  content: string;
  citations: Citation[];
  steps?: ResearchStep[];
  keyFindings?: string[];
  status: ResearchReportStatus;
  sourcesConsulted: number;
  durationMs?: number;
  error?: string | null;
  model?: string | null;
  provider?: string | null;
}

export type PersistedResearchReport = ResearchReport & {
  userId: string;
  requestId: string;
  conversationId?: string;
  query: string;
  model?: string;
  provider?: string;
  updatedAt: string;
};

export class ResearchReportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResearchReportValidationError';
  }
}

function clampText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, max);
}

function toIso(value: string | Date | null): string | undefined {
  if (value === null) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toCount(value: number | string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeCitations(citations: unknown): Citation[] {
  if (!Array.isArray(citations)) return [];
  const out: Citation[] = [];
  for (const entry of citations) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const url = typeof record['url'] === 'string' ? record['url'].trim() : '';
    if (!url) continue;
    const citation: Citation = {
      id: typeof record['id'] === 'string' && record['id'] ? record['id'] : String(out.length + 1),
      title: clampText(record['title'], MAX_TITLE_CHARS) || url,
      url,
      accessedAt:
        typeof record['accessedAt'] === 'string' ? record['accessedAt'] : new Date().toISOString(),
    };
    const source = clampText(record['source'], 200);
    if (source) citation.source = source;
    const snippet = clampText(record['snippet'], 2_000);
    if (snippet) citation.snippet = snippet;
    const relevance = record['relevance'];
    if (typeof relevance === 'number' && Number.isFinite(relevance)) {
      citation.relevance = Math.min(1, Math.max(0, relevance));
    }
    out.push(citation);
    if (out.length >= MAX_CITATIONS) break;
  }
  return out;
}

function normalizeSteps(steps: unknown): ResearchStep[] {
  if (!Array.isArray(steps)) return [];
  return steps.filter(isResearchStep).slice(0, MAX_STEPS);
}

function normalizeKeyFindings(findings: unknown): string[] {
  if (!Array.isArray(findings)) return [];
  return findings
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.slice(0, MAX_KEY_FINDING_CHARS))
    .slice(0, MAX_KEY_FINDINGS);
}

function rowToReport(row: ResearchReportRow): PersistedResearchReport {
  const status: ResearchReportStatus = isResearchReportStatus(row.status) ? row.status : 'failed';
  const report: PersistedResearchReport = {
    id: row.id,
    queryId: row.request_id,
    userId: row.user_id,
    requestId: row.request_id,
    query: row.query,
    title: row.title,
    summary: row.summary,
    content: row.content,
    citations: normalizeCitations(row.citations),
    steps: normalizeSteps(row.steps),
    status,
    sourcesConsulted: toCount(row.sources_consulted) ?? 0,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
  };
  if (row.conversation_id) report.conversationId = row.conversation_id;
  const durationMs = toCount(row.duration_ms);
  if (durationMs !== undefined) report.totalDurationMs = durationMs;
  const keyFindings = normalizeKeyFindings(row.key_findings);
  if (keyFindings.length > 0) report.keyFindings = keyFindings;
  if (row.error) report.error = row.error;
  if (row.model) report.model = row.model;
  if (row.provider) report.provider = row.provider;
  const completedAt = toIso(row.completed_at);
  if (completedAt) report.completedAt = completedAt;
  return report;
}

export async function saveResearchReport(
  db: DatabaseAdapter,
  input: SaveResearchReportInput,
): Promise<PersistedResearchReport> {
  const userId = input.userId?.trim();
  const requestId = input.requestId?.trim();
  if (!userId) throw new ResearchReportValidationError('userId is required');
  if (!requestId) throw new ResearchReportValidationError('requestId is required');
  if (requestId.length > 128) {
    throw new ResearchReportValidationError('requestId exceeds 128 characters');
  }
  if (!isResearchReportStatus(input.status)) {
    throw new ResearchReportValidationError(`Unknown research report status: ${input.status}`);
  }

  const sourcesConsulted =
    Number.isFinite(input.sourcesConsulted) && input.sourcesConsulted > 0
      ? Math.floor(input.sourcesConsulted)
      : 0;
  const durationMs =
    typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
      ? Math.max(0, Math.floor(input.durationMs))
      : null;

  const rows = await db.query<ResearchReportRow>(
    `insert into public.research_reports (
       user_id, request_id, conversation_id, query, title, summary, content,
       citations, steps, key_findings, status, sources_consulted, duration_ms,
       error, model, provider, completed_at
     ) values (
       $1, $2, $3, $4, $5, $6, $7,
       $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13,
       $14, $15, $16,
       case when $11 = 'completed' then now() else null end
     )
     on conflict (user_id, request_id) do update set
       conversation_id = excluded.conversation_id,
       query = excluded.query,
       title = excluded.title,
       summary = excluded.summary,
       content = excluded.content,
       citations = excluded.citations,
       steps = excluded.steps,
       key_findings = excluded.key_findings,
       status = excluded.status,
       sources_consulted = excluded.sources_consulted,
       duration_ms = excluded.duration_ms,
       error = excluded.error,
       model = excluded.model,
       provider = excluded.provider,
       updated_at = now(),
       completed_at = case
         when excluded.status = 'completed' then now()
         else public.research_reports.completed_at
       end
     returning *`,
    [
      userId,
      requestId,
      input.conversationId ?? null,
      clampText(input.query, MAX_QUERY_CHARS),
      clampText(input.title, MAX_TITLE_CHARS),
      clampText(input.summary, MAX_SUMMARY_CHARS),
      clampText(input.content, MAX_CONTENT_CHARS),
      JSON.stringify(normalizeCitations(input.citations)),
      JSON.stringify(normalizeSteps(input.steps)),
      JSON.stringify(normalizeKeyFindings(input.keyFindings)),
      input.status,
      sourcesConsulted,
      durationMs,
      input.error ? clampText(input.error, MAX_ERROR_CHARS) : null,
      input.model ?? null,
      input.provider ?? null,
    ],
  );

  const row = rows[0];
  if (!row) {
    throw new ResearchReportValidationError(
      'Research report was not persisted (row-level security denied the write)',
    );
  }
  return rowToReport(row);
}

export async function getResearchReportByRequestId(
  db: DatabaseAdapter,
  input: { userId: string; requestId: string },
): Promise<PersistedResearchReport | null> {
  if (!input.userId || !input.requestId) return null;
  const rows = await db.query<ResearchReportRow>(
    `select * from public.research_reports
      where user_id = $1 and request_id = $2
      limit 1`,
    [input.userId, input.requestId],
  );
  const row = rows[0];
  return row ? rowToReport(row) : null;
}

export async function listResearchReports(
  db: DatabaseAdapter,
  input: { userId: string; conversationId?: string | null; limit?: number },
): Promise<PersistedResearchReport[]> {
  if (!input.userId) return [];
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 20)));
  const rows = input.conversationId
    ? await db.query<ResearchReportRow>(
        `select * from public.research_reports
          where user_id = $1 and conversation_id = $2
          order by created_at desc
          limit $3`,
        [input.userId, input.conversationId, limit],
      )
    : await db.query<ResearchReportRow>(
        `select * from public.research_reports
          where user_id = $1
          order by created_at desc
          limit $2`,
        [input.userId, limit],
      );
  return rows.map(rowToReport);
}

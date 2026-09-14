import {
  isResearchReportStatus,
  isResearchStep,
  type Citation,
  type ResearchReportStatus,
  type ResearchStep,
} from '@agiworkforce/types';
import { api } from '@/services/api';

export interface MobileResearchReport {
  id: string;
  requestId: string;
  conversationId?: string;
  title: string;
  query: string;
  summary: string;
  content: string;
  citations: Citation[];
  steps: ResearchStep[];
  keyFindings: string[];
  status: ResearchReportStatus;
  sourcesConsulted: number;
  totalDurationMs?: number;
  model?: string;
  error?: string;
  createdAt: string;
}

export const RESEARCH_REPORTS_LIMIT = 50;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function count(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : undefined;
}

function citations(value: unknown): Citation[] {
  if (!Array.isArray(value)) return [];
  const out: Citation[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Record<string, unknown>;
    const url = text(raw['url']);
    if (!url) continue;
    out.push({
      id: text(raw['id']) || `${out.length + 1}`,
      title: text(raw['title']) || url,
      url,
      accessedAt: text(raw['accessedAt']),
      ...(text(raw['snippet']) ? { snippet: text(raw['snippet']) } : {}),
      ...(text(raw['source']) ? { source: text(raw['source']) } : {}),
      ...(text(raw['publishedDate']) ? { publishedDate: text(raw['publishedDate']) } : {}),
    });
  }
  return out;
}

function steps(value: unknown): ResearchStep[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ResearchStep => isResearchStep(entry));
}

function keyFindings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
}

export function mapResearchReport(value: unknown): MobileResearchReport | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw['id']);
  const requestId = text(raw['requestId']);
  if (!id || !requestId) return null;

  const report: MobileResearchReport = {
    id,
    requestId,
    title: text(raw['title']),
    query: text(raw['query']),
    summary: text(raw['summary']),
    content: text(raw['content']),
    citations: citations(raw['citations']),
    steps: steps(raw['steps']),
    keyFindings: keyFindings(raw['keyFindings']),
    status: isResearchReportStatus(raw['status']) ? raw['status'] : 'failed',
    sourcesConsulted: count(raw['sourcesConsulted']) ?? 0,
    createdAt: text(raw['createdAt']),
  };
  if (text(raw['conversationId'])) report.conversationId = text(raw['conversationId']);
  if (text(raw['model'])) report.model = text(raw['model']);
  if (text(raw['error'])) report.error = text(raw['error']);
  const duration = count(raw['totalDurationMs']);
  if (duration !== undefined) report.totalDurationMs = duration;
  return report;
}

export function mapResearchReportsResponse(value: unknown): MobileResearchReport[] {
  if (!value || typeof value !== 'object') return [];
  const rows = (value as { reports?: unknown }).reports;
  if (!Array.isArray(rows)) return [];
  const reports: MobileResearchReport[] = [];
  for (const row of rows) {
    const report = mapResearchReport(row);
    if (report) reports.push(report);
  }
  return reports;
}

export function researchReportLabel(report: MobileResearchReport): string {
  return report.title.trim() || report.query.trim() || 'Untitled report';
}

export async function fetchResearchReports(
  options: { conversationId?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<MobileResearchReport[]> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? RESEARCH_REPORTS_LIMIT),
  });
  if (options.conversationId) params.set('conversationId', options.conversationId);
  const response = await api.get<unknown>(`/api/research/reports?${params.toString()}`, {
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return mapResearchReportsResponse(response);
}

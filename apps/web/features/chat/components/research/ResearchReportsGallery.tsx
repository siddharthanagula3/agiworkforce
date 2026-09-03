'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, Telescope, TriangleAlert } from 'lucide-react';
import type { ResearchReport } from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import { ResearchReportView } from './ResearchReportView';
import { toUserMessage } from '@/lib/user-error-message';

/** How many reports the gallery asks for (endpoint caps the query at 100). */
const GALLERY_LIMIT = 50;

type GalleryReport = ResearchReport & { query?: string; model?: string; provider?: string };

/** Short absolute date; a research report is an artifact, not a live feed. */
function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function ReportRow({ report, onOpen }: { report: GalleryReport; onOpen: () => void }) {
  // Prefer the synthesized title, fall back to the question the run started
  // from. An interrupted run can legitimately have neither.
  const label = report.title.trim() || report.query?.trim() || 'Untitled report';
  const incomplete = report.status !== 'completed';

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex w-full items-start gap-2.5 rounded-lg border border-border/20 bg-muted/20 p-2.5 text-left',
          'transition-colors hover:border-border/50 hover:bg-muted/40',
        )}
      >
        <Telescope className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-foreground">{label}</span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {formatCreatedAt(report.createdAt)}
            {` · ${report.sourcesConsulted} ${report.sourcesConsulted === 1 ? 'source' : 'sources'}`}
            {report.model ? ` · ${report.model}` : ''}
          </span>
        </span>
        {incomplete && (
          <span
            className="mt-0.5 flex shrink-0 items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[12px] font-medium text-muted-foreground"
            title={report.error ?? undefined}
          >
            <TriangleAlert className="h-2.5 w-2.5" aria-hidden="true" />
            {report.status}
          </span>
        )}
      </button>
    </li>
  );
}

interface ResearchReportsGalleryProps {
  /** Host-injected follow-up send, forwarded to whichever report is open. */
  onAskFollowUp?: (prompt: string) => void;
}

export function ResearchReportsGallery({ onAskFollowUp }: ResearchReportsGalleryProps) {
  const [reports, setReports] = useState<GalleryReport[]>([]);
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [openReport, setOpenReport] = useState<GalleryReport | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    setState('loading');
    setError(null);
    try {
      const response = await fetch(`/api/research/reports?limit=${GALLERY_LIMIT}`, {
        signal,
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(`Could not load reports (${response.status})`);
      const body = (await response.json()) as { reports?: GalleryReport[] };
      setReports(body.reports ?? []);
      setState('loaded');
    } catch (fetchError) {
      if (signal.aborted) return;
      setError(toUserMessage(fetchError, 'Could not load reports'));
      setState('error');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (openReport) {
    return (
      <div className="flex h-full min-h-0 flex-col" data-testid="research-reports-gallery-detail">
        <button
          type="button"
          onClick={() => setOpenReport(null)}
          className="flex shrink-0 items-center gap-1 border-b border-border/20 px-4 py-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" aria-hidden="true" />
          All reports
        </button>
        <div className="min-h-0 flex-1">
          <ResearchReportView report={openReport} {...(onAskFollowUp ? { onAskFollowUp } : {})} />
        </div>
      </div>
    );
  }

  if (state === 'loading') {
    return <p className="px-4 py-6 text-center text-xs text-muted-foreground">Loading reports…</p>;
  }
  if (state === 'error') {
    return (
      <p role="alert" className="px-4 py-6 text-center text-xs text-danger">
        {error}
      </p>
    );
  }
  if (reports.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
          <Telescope className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">No reports yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Deep Research runs are saved here across all of your chats
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul
      className="flex-1 space-y-1.5 overflow-y-auto p-3 [scrollbar-width:thin]"
      data-testid="research-reports-gallery"
    >
      {reports.map((report) => (
        <ReportRow key={report.id} report={report} onOpen={() => setOpenReport(report)} />
      ))}
    </ul>
  );
}

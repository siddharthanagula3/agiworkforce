'use client';

/**
 * ResearchReportView (CAP-045 slice 3)
 *
 * A persisted Deep Research report rendered as a durable artifact, mirroring
 * the ArtifactsPanel layout ResearchPanel already follows: header with title
 * and actions, scrollable body, source list at the foot.
 *
 * Everything shown comes from the stored `ResearchReport`. Sections the report
 * does not have (no key findings, no citations) are simply absent — none of
 * them are synthesized here.
 *
 * Export reuses the EXISTING document-export-service (the same one
 * EnhancedExportDialog calls). No new export machinery: markdown, PDF, and
 * DOCX are whatever that service already produces.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  ExternalLink,
  FileCode,
  Globe,
  List,
  Telescope,
  TriangleAlert,
} from 'lucide-react';
import type { Citation, ResearchReport } from '@agiworkforce/types';
import { Button } from '@agiworkforce/ui';
import { MarkdownContent } from '@agiworkforce/unified-chat';
import { cn } from '@shared/lib/utils';
import type { DocumentFormat } from '../../types/message-metadata';
import { documentExportService } from '../../services/document-export-service';

// ============================================================================
// Markdown assembly (export payload)
// ============================================================================

/**
 * The report as one self-contained markdown document: title, summary, key
 * findings, body, and a numbered Sources list whose numbers match the report's
 * inline `[n]` citations.
 */
export function researchReportToMarkdown(report: ResearchReport): string {
  const parts: string[] = [];
  if (report.title.trim()) parts.push(`# ${report.title.trim()}`);
  if (report.summary.trim()) parts.push(report.summary.trim());
  if (report.keyFindings && report.keyFindings.length > 0) {
    parts.push(
      ['## Key findings', ...report.keyFindings.map((finding) => `- ${finding}`)].join('\n'),
    );
  }
  if (report.content.trim()) parts.push(report.content.trim());
  if (report.citations.length > 0) {
    parts.push(
      [
        '## Sources',
        ...report.citations.map(
          (citation, index) => `${index + 1}. [${citation.title}](${citation.url})`,
        ),
      ].join('\n'),
    );
  }
  return parts.join('\n\n');
}

// ============================================================================
// Table of contents
// ============================================================================

export interface ReportHeading {
  id: string;
  text: string;
  level: number;
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Headings of the stored report body, in document order.
 *
 * Fenced code blocks are skipped: a `# comment` inside a fence is not a
 * heading, and counting it would shift every entry's index off the heading
 * elements the markdown renderer actually produces (the TOC scrolls by that
 * index, so a drift sends the reader to the wrong section).
 */
export function extractMarkdownHeadings(markdown: string): ReportHeading[] {
  const headings: ReportHeading[] = [];
  const seen = new Map<string, number>();
  let insideFence = false;

  for (const line of markdown.split('\n')) {
    if (/^\s{0,3}(?:```|~~~)/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;

    const match = /^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;

    const text = match[2]!.replace(/[*_`]/g, '').trim();
    if (!text) continue;

    const base = slugifyHeading(text) || `section-${headings.length + 1}`;
    const used = seen.get(base) ?? 0;
    seen.set(base, used + 1);
    headings.push({
      id: used === 0 ? base : `${base}-${used}`,
      text,
      level: match[1]!.length,
    });
  }

  return headings;
}

// ============================================================================
// Artifact hand-off
// ============================================================================

export interface ReportArtifactInput {
  title: string;
  language: string;
  content: string;
}

/** The report as a markdown artifact the artifacts surface can own and edit. */
export function researchReportToArtifact(report: ResearchReport): ReportArtifactInput {
  return {
    title: report.title || 'Research report',
    language: 'md',
    content: researchReportToMarkdown(report),
  };
}

/** A filesystem-safe base name derived from the report's own title. */
export function researchReportFilename(report: ResearchReport): string {
  const base = (report.title || 'research-report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'research-report';
}

// ============================================================================
// Citation row
// ============================================================================

function CitationRow({ citation, index }: { citation: Citation; index: number }) {
  const [faviconError, setFaviconError] = useState(false);

  let host = citation.url;
  let faviconSrc: string | undefined;
  try {
    const parsed = new URL(citation.url);
    host = parsed.hostname.replace(/^www\./, '');
    // Same provider-agnostic favicon source ResearchPanel's SourceRow and
    // SourcePill already use; `Citation` carries no favicon field of its own.
    faviconSrc = `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`;
  } catch {
    // Non-URL string: show it raw rather than hiding the source, and show the
    // globe placeholder instead of guessing a favicon domain.
  }

  return (
    <li>
      <a
        href={citation.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'group flex items-start gap-2 rounded-lg border border-border/20 bg-muted/20 p-2.5',
          'no-underline transition-colors hover:border-border/50 hover:bg-muted/40',
        )}
      >
        <span className="mt-0.5 flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded bg-primary/10 px-1 text-[11px] font-semibold text-primary">
          {citation.id || index + 1}
        </span>
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
          {faviconSrc && !faviconError ? (
            <img
              src={faviconSrc}
              alt=""
              aria-hidden="true"
              width={16}
              height={16}
              className="h-4 w-4 rounded-sm object-contain"
              onError={() => setFaviconError(true)}
            />
          ) : (
            <Globe className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-foreground group-hover:text-primary">
            {citation.title || host}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground/70">{host}</span>
        </span>
        <ExternalLink
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground/80"
          aria-hidden="true"
        />
      </a>
    </li>
  );
}

// ============================================================================
// Report view
// ============================================================================

const EXPORT_FORMATS: Array<{ id: DocumentFormat; label: string }> = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'pdf', label: 'PDF' },
  { id: 'docx', label: 'Word' },
];

interface ResearchReportViewProps {
  report: ResearchReport;
  /** Optional close affordance when the view is hosted in a panel. */
  onClose?: () => void;
  /** Injected in tests; defaults to the shared document-export-service. */
  exportService?: Pick<typeof documentExportService, 'exportDocument'>;
  /**
   * Host-injected hand-off to the artifacts surface. Supplied by hosts that
   * HAVE one (the chat panel); left undefined elsewhere (the standalone report
   * gallery), where no artifacts panel exists to receive the result — an action
   * that cannot work must not be offered.
   */
  onCreateArtifact?: (artifact: ReportArtifactInput) => void;
}

export function ResearchReportView({
  report,
  onClose,
  exportService,
  onCreateArtifact,
}: ResearchReportViewProps) {
  const [exportingFormat, setExportingFormat] = useState<DocumentFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const service = exportService ?? documentExportService;

  const markdown = useMemo(() => researchReportToMarkdown(report), [report]);
  const headings = useMemo(() => extractMarkdownHeadings(report.content), [report.content]);
  const bodyRef = useRef<HTMLElement | null>(null);

  // The markdown renderer emits plain headings with no ids, so the anchors the
  // contents list needs are stamped onto the rendered nodes here, in document
  // order, against the same heading list the list itself is built from.
  useEffect(() => {
    const rendered = bodyRef.current?.querySelectorAll<HTMLElement>('h1, h2, h3, h4');
    if (!rendered) return;
    headings.forEach((heading, index) => {
      const element = rendered[index];
      if (element) element.id = heading.id;
    });
  }, [headings]);

  const scrollToHeading = useCallback((headingId: string) => {
    const target = bodyRef.current?.ownerDocument.getElementById(headingId);
    target?.scrollIntoView?.({ block: 'start' });
  }, []);

  const handleExport = useCallback(
    async (format: DocumentFormat) => {
      setExportingFormat(format);
      setExportError(null);
      try {
        await service.exportDocument(markdown, format, researchReportFilename(report), {
          title: report.title,
          metadata: {
            status: report.status,
            sources: String(report.sourcesConsulted),
            generated: report.completedAt ?? report.createdAt,
          },
        });
      } catch (error) {
        // Export runs in the browser; a failure must be visible, not swallowed.
        setExportError(error instanceof Error ? error.message : 'Export failed');
      } finally {
        setExportingFormat(null);
      }
    },
    [markdown, report, service],
  );

  const incomplete = report.status !== 'completed';

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="research-report-view">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border/30 px-4 py-3">
        <div className="flex min-w-0 items-start gap-2">
          <Telescope className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">
              {report.title || 'Research report'}
            </h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {report.sourcesConsulted} {report.sourcesConsulted === 1 ? 'source' : 'sources'}
              {typeof report.totalDurationMs === 'number' &&
                ` · ${Math.round(report.totalDurationMs / 1000)}s`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onCreateArtifact && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => onCreateArtifact(researchReportToArtifact(report))}
              data-testid="research-report-create-artifact"
              aria-label="Turn this report into an artifact"
            >
              <FileCode className="h-3 w-3" aria-hidden="true" />
              Artifact
            </Button>
          )}
          {EXPORT_FORMATS.map((format) => (
            <Button
              key={format.id}
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={exportingFormat !== null}
              onClick={() => void handleExport(format.id)}
              data-testid={`research-report-export-${format.id}`}
              aria-label={`Export report as ${format.label}`}
            >
              <Download className="h-3 w-3" aria-hidden="true" />
              {format.label}
            </Button>
          ))}
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onClose}
              aria-label="Close research report"
            >
              Close
            </Button>
          )}
        </div>
      </div>

      {exportError && (
        <p
          role="alert"
          className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive"
        >
          {exportError}
        </p>
      )}

      {incomplete && (
        <p className="flex items-center gap-2 border-b border-border/30 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          This report is {report.status}
          {report.error ? `: ${report.error}` : '.'}
        </p>
      )}

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-width:thin]">
        {report.summary && (
          <p className="mb-4 text-sm leading-relaxed text-foreground">{report.summary}</p>
        )}

        {report.keyFindings && report.keyFindings.length > 0 && (
          <section className="mb-4" aria-labelledby="research-report-key-findings">
            <h3
              id="research-report-key-findings"
              className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Key findings
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
              {report.keyFindings.map((finding, index) => (
                <li key={`${index}-${finding.slice(0, 24)}`}>{finding}</li>
              ))}
            </ul>
          </section>
        )}

        {headings.length >= 3 && (
          <nav
            className="mb-4 rounded-lg border border-border/30 bg-muted/20 p-3"
            aria-label="Report contents"
          >
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              Contents
            </p>
            <ol className="space-y-0.5" data-testid="research-report-toc">
              {headings.map((heading) => (
                <li
                  key={heading.id}
                  style={{
                    paddingLeft: `${(heading.level - (headings[0]?.level ?? 1)) * 12}px`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => scrollToHeading(heading.id)}
                    className="block w-full truncate text-left text-xs text-muted-foreground transition-colors hover:text-primary"
                  >
                    {heading.text}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        )}

        {/*
          The stored body is markdown, so it goes through the same renderer the
          chat transcript uses. Rendering it as preformatted text showed saved
          reports as literal `##`, `**`, and `[text](url)` syntax.
        */}
        <article
          ref={bodyRef}
          className="text-sm leading-relaxed text-foreground"
          data-testid="research-report-content"
        >
          <MarkdownContent content={report.content} />
        </article>

        {report.citations.length > 0 && (
          <section className="mt-5" aria-labelledby="research-report-sources">
            <h3
              id="research-report-sources"
              className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Sources
            </h3>
            <ul className="space-y-1.5">
              {report.citations.map((citation, index) => (
                <CitationRow key={citation.url + index} citation={citation} index={index} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

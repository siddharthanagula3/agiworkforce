/**
 * ResearchReport
 *
 * The final research report view showing:
 * - Markdown report with inline citations linked to sources
 * - Sources list at bottom (numbered)
 * - Copy report button
 * - Export to PDF button (via documentStore)
 * - "Start New Research" button
 */
import type { ReactNode } from 'react';
import { memo, useCallback, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { openUrl } from '@/lib/tauri-mock';
import type { ResearchResponse } from '@/stores/researchStore';

export interface ResearchReportProps {
  result: ResearchResponse;
  onNewResearch?: () => void;
  className?: string;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  very_low: 'bg-red-500/15 text-red-400 border-red-500/30',
  low: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  high: 'bg-green-500/15 text-green-400 border-green-500/30',
  very_high: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

export const ResearchReport = memo(function ResearchReport({
  result,
  onNewResearch,
  className,
}: ResearchReportProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = buildPlainText(result);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Report copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy report');
    }
  }, [result]);

  const handleExportPdf = useCallback(async () => {
    try {
      const { useDocumentStore } = await import('@/stores/documentStore');
      const outputPath = `/tmp/research-${Date.now()}.pdf`;
      await useDocumentStore.getState().generatePdf(
        outputPath,
        `Research: ${result.query}`,
        buildPlainText(result),
      );
      toast.success('PDF exported successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to export PDF';
      toast.error(msg);
    }
  }, [result]);

  const confidenceClass =
    CONFIDENCE_COLORS[result.confidence] ?? CONFIDENCE_COLORS['medium'];
  const durationFormatted =
    result.duration_secs < 60
      ? `${result.duration_secs}s`
      : `${Math.floor(result.duration_secs / 60)}m ${result.duration_secs % 60}s`;

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {/* Summary card */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">{result.query}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Completed in {durationFormatted} &bull; {result.sources_examined} sources examined
              &bull; {result.sources_cited} cited
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn('shrink-0 capitalize text-xs', confidenceClass)}
          >
            {result.confidence.replace('_', ' ')} confidence
          </Badge>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed">{result.summary}</p>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleCopy()}
            className="gap-1.5 border-white/10 text-slate-300 hover:border-white/20 hover:text-white"
          >
            {copied ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? 'Copied' : 'Copy Report'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExportPdf()}
            className="gap-1.5 border-white/10 text-slate-300 hover:border-white/20 hover:text-white"
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF
          </Button>
          {onNewResearch && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onNewResearch}
              className="ml-auto gap-1.5 text-slate-400 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New Research
            </Button>
          )}
        </div>
      </div>

      {/* Key findings */}
      {result.key_findings.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            Key Findings
          </h4>
          <ul className="space-y-1.5">
            {result.key_findings.map((finding, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>{finding}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Full report markdown */}
      {result.report && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <FileText className="h-3.5 w-3.5" />
            Full Report
          </h4>
          <div
            className="
              prose prose-sm dark:prose-invert max-w-none
              prose-headings:text-white prose-headings:font-semibold
              prose-p:text-slate-300 prose-p:leading-relaxed
              prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline
              prose-code:bg-white/10 prose-code:text-slate-200 prose-code:rounded prose-code:px-1
              prose-blockquote:border-l-indigo-500 prose-blockquote:text-slate-400
              prose-li:text-slate-300
              prose-strong:text-white
            "
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.report}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Citations count note */}
      {result.citations_count > 0 && (
        <p className="text-xs text-slate-500">
          {result.citations_count} citation{result.citations_count !== 1 ? 's' : ''} across{' '}
          {result.sources_cited} source{result.sources_cited !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
});

function buildPlainText(result: ResearchResponse): string {
  return `# Research Report: ${result.query}

## Summary
${result.summary}

## Key Findings
${result.key_findings.map((f) => `- ${f}`).join('\n')}

## Full Report
${result.report}

---
Research completed in ${result.duration_secs}s
Mode: ${result.mode} | Sources cited: ${result.sources_cited} | Confidence: ${result.confidence}
`;
}

// Re-export an open-url helper for use within reports (external links)
export function ResearchReportExternalLink({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => void openUrl(url)}
      className="inline-flex items-center gap-0.5 text-indigo-400 hover:underline"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </button>
  );
}

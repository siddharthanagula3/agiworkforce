'use client';

/**
 * ResearchPanel
 *
 * Right-sidebar panel that shows a list of web search sources associated with
 * the most recent assistant message that contained search results. Mirrors the
 * ArtifactsPanel pattern: inline panel on desktop, full-screen overlay on mobile.
 *
 * Opened via the ResearchToggleButton in the chat header (see WebChatPage) or
 * programmatically via useResearchPanelStore.openPanel(...).
 */

import { useCallback, useEffect, useState } from 'react';
import { Globe, X, ExternalLink, Search, PanelRight, Telescope } from 'lucide-react';
import type { ResearchReport } from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import { Button, EmptyState } from '@agiworkforce/ui';
import { useResearchPanelStore, type ResearchSource } from '../../stores/research-panel-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { ResearchReportView, type ReportArtifactInput } from './ResearchReportView';
import { ResearchReportsGallery } from './ResearchReportsGallery';

// ============================================================================
// Source row
// ============================================================================

function SourceRow({ source, index }: { source: ResearchSource; index: number }) {
  const [imgError, setImgError] = useState(false);

  // Derive a clean display hostname from the URL
  let displayHost = source.url;
  try {
    displayHost = new URL(source.url).hostname.replace(/^www\./, '');
  } catch {
    // keep raw
  }

  // Fall back to Google's favicon service when no favicon was provided
  const faviconSrc =
    source.favicon && !imgError
      ? source.favicon
      : (() => {
          try {
            const domain = new URL(source.url).hostname;
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
          } catch {
            return undefined;
          }
        })();

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group flex items-start gap-3 rounded-lg p-3 no-underline',
        'bg-muted/20 hover:bg-muted/40',
        'border border-border/20 hover:border-border/50',
        'transition-all duration-150',
      )}
    >
      {/* Citation index badge */}
      <span className="mt-0.5 flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded bg-primary/10 px-1 text-[11px] font-semibold text-primary">
        {source.citationIndex ?? index + 1}
      </span>

      {/* Favicon */}
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        {faviconSrc ? (
          <img
            src={faviconSrc}
            alt=""
            className="h-4 w-4 rounded-sm"
            onError={() => setImgError(true)}
          />
        ) : (
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>

      {/* Text content */}
      <div className="min-w-0 flex-1 space-y-0.5">
        <h4 className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
          {source.title || displayHost}
        </h4>
        <p className="truncate text-[11px] text-muted-foreground/70">{displayHost}</p>
        {source.snippet && (
          <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/60">
            {source.snippet}
          </p>
        )}
      </div>

      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60" />
    </a>
  );
}

// ============================================================================
// Empty state
// ============================================================================

function SourcesEmptyState() {
  return (
    <EmptyState
      icon={Search}
      title="No sources yet"
      description="Web search sources will appear here"
      className="flex-1"
    />
  );
}

// ============================================================================
// Persisted report tab (CAP-045 slice 3)
// ============================================================================

/**
 * Loads the durable reports this conversation produced and renders the newest
 * one as an artifact-style view. Nothing is rendered optimistically: until the
 * server confirms a persisted report exists, the tab says so plainly.
 */
function ReportTab({ conversationId }: { conversationId: string | null }) {
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const addArtifact = useArtifactsStore((s) => s.addArtifact);
  const setArtifactsPanelOpen = useArtifactsStore((s) => s.setPanelOpen);
  const closePanel = useResearchPanelStore((s) => s.closePanel);

  // Both panels occupy the same right-hand slot, so the hand-off swaps them
  // rather than stacking two sidebars.
  const createArtifact = useCallback(
    (artifact: ReportArtifactInput) => {
      const id = addArtifact({
        id: `research-report-${report?.id ?? crypto.randomUUID()}`,
        type: 'document',
        title: artifact.title,
        language: artifact.language,
        content: artifact.content,
        messageId: '',
        ...(conversationId ? { conversationId } : {}),
      });
      useArtifactsStore.getState().selectArtifact(id);
      setArtifactsPanelOpen(true);
      closePanel();
    },
    [addArtifact, closePanel, conversationId, report?.id, setArtifactsPanelOpen],
  );

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!conversationId) {
        setState('loaded');
        setReport(null);
        return;
      }
      setState('loading');
      setError(null);
      try {
        const response = await fetch(
          `/api/research/reports?conversationId=${encodeURIComponent(conversationId)}&limit=1`,
          { signal, credentials: 'same-origin' },
        );
        if (!response.ok) throw new Error(`Could not load reports (${response.status})`);
        const body = (await response.json()) as { reports?: ResearchReport[] };
        setReport(body.reports?.[0] ?? null);
        setState('loaded');
      } catch (fetchError) {
        if (signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load reports');
        setState('error');
      }
    },
    [conversationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (state === 'loading' || state === 'idle') {
    return (
      <p className="px-4 py-6 text-center text-xs text-muted-foreground">Loading saved report…</p>
    );
  }
  if (state === 'error') {
    return (
      <p role="alert" className="px-4 py-6 text-center text-xs text-destructive">
        {error}
      </p>
    );
  }
  if (!report) {
    return (
      <EmptyState
        icon={Telescope}
        title="No saved report yet"
        description="Deep Research runs save their report here when they finish"
        className="flex-1"
      />
    );
  }
  return <ResearchReportView report={report} onCreateArtifact={createArtifact} />;
}

// ============================================================================
// Main panel
// ============================================================================

export function ResearchPanel() {
  const panelOpen = useResearchPanelStore((s) => s.panelOpen);
  const closePanel = useResearchPanelStore((s) => s.closePanel);
  const sourcesFor = useResearchPanelStore((s) => s.sourcesFor);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  // Scope to the active conversation: a chat that didn't run a web search shows
  // no sources, never a previous chat's leftover sources.
  const { sources, query } = sourcesFor(activeConversationId);
  // Three views: the live source list, the durable report THIS run persisted
  // (CAP-045 slice 3), and every report the user owns across all conversations
  // (the gallery — `GET /api/research/reports` with no conversationId).
  const [tab, setTab] = useState<'sources' | 'report' | 'library'>('sources');

  if (!panelOpen) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm sm:hidden"
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          'flex flex-col border-l border-border/30',
          'bg-card/95 backdrop-blur-xl',
          // Mobile: full-screen overlay
          'fixed inset-y-0 right-0 z-40 w-full',
          // Desktop: inline panel, same width as ArtifactsPanel
          'sm:relative sm:inset-auto sm:z-auto sm:w-[360px] sm:min-w-[280px] sm:shrink',
          // Slide-in animation
          'animate-in slide-in-from-right duration-300',
        )}
        aria-label="Research panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <PanelRight className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center gap-1" role="tablist" aria-label="Research views">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'sources'}
                onClick={() => setTab('sources')}
                className={cn(
                  'rounded-md px-2 py-0.5 text-sm font-semibold transition-colors',
                  tab === 'sources'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Sources
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'report'}
                onClick={() => setTab('report')}
                className={cn(
                  'rounded-md px-2 py-0.5 text-sm font-semibold transition-colors',
                  tab === 'report'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Report
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'library'}
                onClick={() => setTab('library')}
                className={cn(
                  'rounded-md px-2 py-0.5 text-sm font-semibold transition-colors',
                  tab === 'library'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Library
              </button>
            </div>
            {tab === 'sources' && sources.length > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {sources.length}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={closePanel}
            className="h-7 w-7 p-0"
            aria-label="Close sources panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {tab === 'library' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <ResearchReportsGallery />
          </div>
        ) : tab === 'report' ? (
          <div className="min-h-0 flex-1">
            <ReportTab conversationId={activeConversationId} />
          </div>
        ) : (
          <>
            {/* Query line (if present) */}
            {query && (
              <div className="border-b border-border/20 px-4 py-2">
                <div className="inline-flex items-center gap-1.5 rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                  <Search className="h-3 w-3 shrink-0" />
                  <span className="font-mono">{query}</span>
                </div>
              </div>
            )}

            {/* Source list */}
            {sources.length === 0 ? (
              <SourcesEmptyState />
            ) : (
              <div className="flex-1 space-y-2 overflow-y-auto p-3 [scrollbar-width:thin]">
                {sources.map((source, index) => (
                  <SourceRow key={`${source.url}-${index}`} source={source} index={index} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ============================================================================
// Toggle button (for chat header)
// ============================================================================

export function ResearchToggleButton({ count = 0 }: { count?: number }) {
  const { panelOpen, togglePanel } = useResearchPanelStore();

  return (
    <button
      onClick={togglePanel}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
        panelOpen
          ? 'bg-primary/15 text-primary'
          : 'bg-card/60 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted/60 hover:text-foreground',
      )}
      aria-label={panelOpen ? 'Close sources panel' : 'Open sources panel'}
      title="Research sources"
    >
      <Globe className="h-4 w-4" />
      {count > 0 && !panelOpen && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {count}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// Collapsible inline sources list (used inside MessageBubble)
// ============================================================================

interface InlineSourcesListProps {
  sources: ResearchSource[];
  query?: string;
}

/** Derive a clean host and a favicon URL (provider favicon → Google fallback). */
function sourceDisplay(source: ResearchSource): { host: string; favicon?: string } {
  let host = source.url;
  let favicon = source.favicon;
  try {
    const parsed = new URL(source.url);
    host = parsed.hostname.replace(/^www\./, '');
    if (!favicon) {
      favicon = `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`;
    }
  } catch {
    // Non-URL string: keep raw host, no favicon.
  }
  return { host, favicon };
}

/** A single inline source chip: number badge + favicon + domain. */
function SourcePill({ source, index }: { source: ResearchSource; index: number }) {
  const [imgError, setImgError] = useState(false);
  const { host, favicon } = sourceDisplay(source);
  const label = source.title || host;
  const number = source.citationIndex ?? index + 1;

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      role="listitem"
      title={label}
      aria-label={`Source ${number}: ${label}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border/30',
        'bg-muted/30 px-2 py-0.5 text-[11px] no-underline',
        'text-muted-foreground hover:border-border/60 hover:bg-muted/60 hover:text-foreground',
        'transition-colors duration-100',
      )}
    >
      <span className="flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-primary/15 px-0.5 text-[9px] font-bold text-primary">
        {number}
      </span>
      {favicon && !imgError ? (
        <img
          src={favicon}
          alt=""
          aria-hidden="true"
          width={12}
          height={12}
          className="h-3 w-3 shrink-0 rounded-[2px] object-contain"
          onError={() => setImgError(true)}
        />
      ) : (
        <Globe className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
      )}
      <span className="max-w-[120px] truncate">{host}</span>
    </a>
  );
}

export function InlineSourcesList({ sources, query }: InlineSourcesListProps) {
  const openPanel = useResearchPanelStore((s) => s.openPanel);
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  if (sources.length === 0) return null;

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-1.5"
      role="list"
      aria-label={query ? `Sources for "${query}"` : 'Web search sources'}
    >
      {/* Compact "Sources" label (claude.ai parity) with the deduped count. */}
      <span className="mr-0.5 text-[11px] font-medium text-muted-foreground/70">
        {sources.length} {sources.length === 1 ? 'source' : 'sources'}
      </span>

      {sources.map((source, index) => (
        <SourcePill key={`${source.url}-${index}`} source={source} index={index} />
      ))}

      {/* View all link -- opens the full-detail panel */}
      <button
        type="button"
        onClick={() => openPanel(activeConversationId, sources, query)}
        className="inline-flex items-center gap-1 rounded-full border border-border/20 bg-transparent px-2 py-0.5 text-[11px] text-muted-foreground/70 transition-colors hover:border-border/50 hover:text-primary"
        aria-label="Open all sources in panel"
      >
        <PanelRight className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
        <span>All sources</span>
      </button>
    </div>
  );
}

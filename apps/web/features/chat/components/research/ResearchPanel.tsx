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

import { useCallback, useEffect, useRef, useState } from 'react';
import { Globe, X, ExternalLink, Search, PanelRight, Telescope } from 'lucide-react';
import type { ResearchReport } from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import { Button, EmptyState } from '@agiworkforce/ui';
import { useResearchPanelStore, type ResearchSource } from '../../stores/research-panel-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { ResearchReportView, type ReportArtifactInput } from './ResearchReportView';
import { ResearchReportsGallery } from './ResearchReportsGallery';
import { toUserMessage } from '@/lib/user-error-message';
import { useOverlayDialog, useOverlayLayout } from '../../hooks/use-overlay-dialog';

// ============================================================================
// Source row
// ============================================================================

const TITLE_FALLBACK_MAX_LENGTH = 60;

function pathTrimmedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    const combined = path && path !== '/' ? `${host}${path}` : host;
    return combined.length > TITLE_FALLBACK_MAX_LENGTH
      ? `${combined.slice(0, TITLE_FALLBACK_MAX_LENGTH - 1)}…`
      : combined;
  } catch {
    return url.length > TITLE_FALLBACK_MAX_LENGTH
      ? `${url.slice(0, TITLE_FALLBACK_MAX_LENGTH - 1)}…`
      : url;
  }
}

const SLUG_EXTENSION_PATTERN = /\.\w{2,5}$/;
const SLUG_SEPARATOR_PATTERN = /[-_]+/g;
const WORD_START_PATTERN = /\b\w/g;

export function humanizedPathTitle(url: string): string | undefined {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    const last = segments.at(-1);
    if (!last) return undefined;
    const words = last
      .replace(SLUG_EXTENSION_PATTERN, '')
      .replace(SLUG_SEPARATOR_PATTERN, ' ')
      .trim();
    if (!words) return undefined;
    return words.replace(WORD_START_PATTERN, (char) => char.toUpperCase());
  } catch {
    return undefined;
  }
}

function SourceRow({ source, badge }: { source: ResearchSource; badge?: number }) {
  const [imgError, setImgError] = useState(false);

  // Derive a clean display hostname from the URL
  let displayHost = source.url;
  try {
    displayHost = new URL(source.url).hostname.replace(/^www\./, '');
  } catch {
    // keep raw
  }

  const displayTitle =
    source.title && source.title !== source.url
      ? source.title
      : (humanizedPathTitle(source.url) ?? pathTrimmedUrl(source.url));

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
      {badge !== undefined && (
        <span className="mt-0.5 flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded bg-primary/10 px-1 text-[12px] font-semibold text-primary">
          {badge}
        </span>
      )}

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
          {displayTitle}
        </h4>
        <p className="truncate text-[12px] text-muted-foreground">{displayHost}</p>
        {source.snippet && (
          <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
            {source.snippet}
          </p>
        )}
      </div>

      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
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
function ReportTab({
  conversationId,
  onAskFollowUp,
}: {
  conversationId: string | null;
  onAskFollowUp?: (prompt: string) => void;
}) {
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
        setError(toUserMessage(fetchError, 'Could not load reports'));
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
      <p role="alert" className="px-4 py-6 text-center text-xs text-danger">
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
  return (
    <ResearchReportView
      report={report}
      onCreateArtifact={createArtifact}
      {...(onAskFollowUp ? { onAskFollowUp } : {})}
    />
  );
}

// ============================================================================
// Main panel
// ============================================================================

interface ResearchPanelProps {
  /**
   * Send a grounded follow-up into the chat this panel sits beside. Supplied
   * only while the page can actually start a turn, so a report never shows a
   * composer whose question would go nowhere.
   */
  onAskFollowUp?: (prompt: string) => void;
}

export function ResearchPanel({ onAskFollowUp }: ResearchPanelProps) {
  const panelOpen = useResearchPanelStore((s) => s.panelOpen);
  const closePanel = useResearchPanelStore((s) => s.closePanel);
  const sourcesFor = useResearchPanelStore((s) => s.sourcesFor);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const { cited, more, query } = sourcesFor(activeConversationId);
  const sourceCount = cited.length + more.length;
  const [tab, setTab] = useState<'sources' | 'report' | 'library'>('sources');

  // The follow-up lands in the transcript behind this panel, so the panel gets
  // out of the way to show it arriving.
  const askFollowUpAndClose = onAskFollowUp
    ? (prompt: string) => {
        onAskFollowUp(prompt);
        closePanel();
      }
    : undefined;

  const panelRef = useRef<HTMLDivElement>(null);
  const layout = useOverlayLayout();
  const isModalOverlay = layout === 'mobile' && panelOpen;
  useOverlayDialog(panelRef, isModalOverlay, closePanel);

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
        ref={panelRef}
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
        // Only the covering form is a dialog. Beside the conversation this is an
        // ordinary region and must not trap focus or swallow Escape.
        {...(isModalOverlay ? { role: 'dialog' as const, 'aria-modal': true, tabIndex: -1 } : {})}
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
            {tab === 'sources' && sourceCount > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[12px] font-medium text-primary">
                {sourceCount}
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
            <ResearchReportsGallery
              {...(askFollowUpAndClose ? { onAskFollowUp: askFollowUpAndClose } : {})}
            />
          </div>
        ) : tab === 'report' ? (
          <div className="min-h-0 flex-1">
            <ReportTab
              conversationId={activeConversationId}
              {...(askFollowUpAndClose ? { onAskFollowUp: askFollowUpAndClose } : {})}
            />
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

            {sourceCount === 0 ? (
              <SourcesEmptyState />
            ) : (
              <div className="flex-1 space-y-4 overflow-y-auto p-3 [scrollbar-width:thin]">
                {cited.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="px-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Citations
                    </h3>
                    {cited.map((source, index) => (
                      <SourceRow
                        key={`${source.url}-${index}`}
                        source={source}
                        badge={source.citationIndex ?? index + 1}
                      />
                    ))}
                  </div>
                )}
                {more.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="px-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                      More
                    </h3>
                    {more.map((source, index) => (
                      <SourceRow key={`${source.url}-${index}`} source={source} />
                    ))}
                  </div>
                )}
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
        <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[12px] font-bold text-primary-foreground">
          {count}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// Compact sources control (used inside MessageBubble's action row)
// ============================================================================

function sourceDisplay(source: ResearchSource): { host: string; favicon?: string } {
  try {
    const parsed = new URL(source.url);
    return {
      host: parsed.hostname.replace(/^www\./, ''),
      favicon:
        source.favicon ?? `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`,
    };
  } catch {
    return { host: source.url, favicon: source.favicon };
  }
}

function SourceFavicon({ source }: { source: ResearchSource }) {
  const [imgError, setImgError] = useState(false);
  const { favicon } = sourceDisplay(source);

  if (favicon && !imgError) {
    return (
      <img
        src={favicon}
        alt=""
        aria-hidden="true"
        width={20}
        height={20}
        className="h-5 w-5 shrink-0 rounded-full bg-card object-contain ring-2 ring-background"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted ring-2 ring-background">
      <Globe className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
    </span>
  );
}

interface SourcesControlProps {
  messageId: string;
  cited: ResearchSource[];
  more: ResearchSource[];
  query?: string;
}

export function SourcesControl({ messageId, cited, more, query }: SourcesControlProps) {
  const openPanel = useResearchPanelStore((s) => s.openPanel);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const total = cited.length + more.length;

  if (total === 0) return null;

  const preview = (cited.length > 0 ? cited : more).slice(0, 3);

  return (
    <button
      type="button"
      onClick={() => openPanel(activeConversationId, messageId, cited, more, query)}
      className="inline-flex items-center gap-2 rounded-full border border-border/30 bg-muted/20 py-1.5 pl-1.5 pr-3 text-[13px] text-muted-foreground transition-colors hover:border-border/60 hover:bg-muted/50 hover:text-foreground"
      aria-label={`View ${total} ${total === 1 ? 'source' : 'sources'}`}
    >
      <span className="flex items-center -space-x-2">
        {preview.map((source, index) => (
          <SourceFavicon key={`${source.url}-${index}`} source={source} />
        ))}
      </span>
      <span className="font-medium">Sources{total > 3 ? ` · ${total}` : ''}</span>
    </button>
  );
}

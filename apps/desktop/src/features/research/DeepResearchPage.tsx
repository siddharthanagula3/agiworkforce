/**
 * DeepResearchPage Component
 *
 * Dedicated deep research page with:
 * - Large query input with research topic suggestions
 * - Research depth selector (Quick / Standard / Deep)
 * - Live progress visualization while a session is active
 * - Recent research history
 */
import { useState, useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Telescope,
  Search,
  X,
  ChevronRight,
  BookOpen,
  Clock,
  Zap,
  BarChart2,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { cn } from '@/lib/utils';
import {
  useResearchStore,
  selectActiveSession,
  selectHistory,
  selectIsResearching,
  type ResearchModeId,
  type ResearchHistoryEntry,
} from '@/stores/researchStore';
import { ResearchProgress } from './ResearchProgress';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUGGESTED_TOPICS = [
  'AI adoption trends in the enterprise',
  'Climate technology investment landscape',
  'Competitive analysis of LLM providers',
  'Regulatory changes in financial services',
  'Best practices in distributed systems',
  'Impact of automation on job markets',
];

interface DepthOption {
  id: ResearchModeId;
  label: string;
  description: string;
  sources: string;
  icon: React.ElementType;
  estimatedTime: string;
}

// Source ceilings and durations mirror the native engine so the cards cannot
// promise something the orchestrator will not do: `ResearchMode::
// max_sources_per_agent` and the `research_get_modes` estimates in
// src-tauri/src/core/research/types.rs and sys/commands/research.rs.
const DEPTH_OPTIONS: DepthOption[] = [
  {
    id: 'quick',
    label: 'Quick',
    description: 'Fast overview with key points',
    sources: 'up to 5 sources per agent',
    icon: Zap,
    estimatedTime: '30s - 2m',
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Balanced depth and speed',
    sources: 'up to 10 sources per agent',
    icon: BarChart2,
    estimatedTime: '2 - 10m',
  },
  {
    id: 'deep',
    label: 'Deep',
    description: 'Comprehensive multi-angle analysis',
    sources: 'up to 20 sources per agent',
    icon: Layers,
    estimatedTime: '5 - 30m',
  },
];

const MODE_LABELS: Record<string, string> = {
  quick: 'Quick',
  standard: 'Standard',
  deep: 'Deep',
  exhaustive: 'Exhaustive',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface DepthCardProps {
  option: DepthOption;
  selected: boolean;
  onSelect: (id: ResearchModeId) => void;
}

function DepthCard({ option, selected, onSelect }: DepthCardProps) {
  const Icon = option.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(option.id)}
      className={cn(
        'flex-1 flex flex-col gap-1 p-3 rounded-lg border text-left transition-all',
        selected
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', selected ? 'text-primary' : 'text-muted-foreground')} />
        <span className="text-sm font-medium">{option.label}</span>
      </div>
      <p className="text-xs leading-snug">{option.description}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-muted-foreground">{option.sources}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">{option.estimatedTime}</span>
      </div>
    </button>
  );
}

interface HistoryItemProps {
  entry: ResearchHistoryEntry;
  onClick: (entry: ResearchHistoryEntry) => void;
}

function HistoryItem({ entry, onClick }: HistoryItemProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(entry)}
      className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-muted/60 transition-colors text-left group"
    >
      <div className="shrink-0 mt-0.5 w-8 h-8 flex items-center justify-center rounded-md bg-muted">
        <BookOpen className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground font-medium truncate">{entry.query}</p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{entry.summary}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground px-1.5 py-0">
            {MODE_LABELS[entry.mode] ?? entry.mode}
          </Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(entry.timestamp)}
          </span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0 mt-1 transition-colors" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface DeepResearchPageProps {
  className?: string;
}

export function DeepResearchPage({ className }: DeepResearchPageProps) {
  const [query, setQuery] = useState('');
  const [depth, setDepth] = useState<ResearchModeId>('standard');

  const activeSession = useResearchStore(selectActiveSession);
  const history = useResearchStore(selectHistory);
  const isResearching = useResearchStore(selectIsResearching);

  const { startResearch, cancelResearch, resetSession, initialize } = useResearchStore(
    useShallow((s) => ({
      startResearch: s.startResearch,
      cancelResearch: s.cancelResearch,
      resetSession: s.resetSession,
      initialize: s.initialize,
    })),
  );

  // Initialize research store on mount
  useEffect(() => {
    initialize().catch((err: unknown) => {
      console.error('Failed to initialize research store:', err);
    });
  }, [initialize]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSuggestedTopic = useCallback((topic: string) => {
    setQuery(topic);
  }, []);

  const handleHistoryClick = useCallback((entry: ResearchHistoryEntry) => {
    setQuery(entry.query);
    setDepth(entry.mode);
  }, []);

  const handleStartResearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      toast.error('Please enter a research topic.');
      return;
    }

    try {
      await startResearch(trimmed, depth);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Research failed. Please try again.';
      toast.error(message);
    }
  }, [query, depth, startResearch]);

  const handleCancel = useCallback(async () => {
    try {
      await cancelResearch();
    } catch (err) {
      console.error('Failed to cancel research:', err);
    }
  }, [cancelResearch]);

  const handleNewResearch = useCallback(() => {
    resetSession();
    setQuery('');
  }, [resetSession]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const showProgress = isResearching && activeSession.progress !== null;
  const showResult = activeSession.status === 'complete' && activeSession.result !== null;
  const showError = activeSession.status === 'error' && activeSession.error !== null;
  const recentHistory = history.slice(0, 5);

  return (
    <div
      className={cn('flex h-full bg-background', className)}
      data-testid="research-workspace"
      role="region"
      aria-label="Deep research workspace"
    >
      {/* Main panel */}
      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
          {/* Page header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Telescope className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Deep Research</h1>
              <p className="text-sm text-muted-foreground">
                Multi-source AI research with cited findings
              </p>
            </div>
          </div>

          {/* Active session: progress */}
          {showProgress && activeSession.progress && (
            <ResearchProgress progress={activeSession.progress} onCancel={handleCancel} />
          )}

          {/* Active session: result */}
          {showResult && activeSession.result && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Research Complete</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground h-7"
                  onClick={handleNewResearch}
                >
                  New Research
                </Button>
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                {activeSession.result.summary}
              </p>
              {activeSession.result.key_findings.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Key Findings
                  </h4>
                  <ul className="space-y-1.5">
                    {activeSession.result.key_findings.map((finding, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <ChevronRight className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                        <span>{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground border-t border-border">
                <span>{activeSession.result.sources_cited} sources cited</span>
                <span>{activeSession.result.citations_count} citations</span>
                <span className="capitalize">{activeSession.result.confidence} confidence</span>
              </div>
            </div>
          )}

          {/* Active session: error */}
          {showError && (
            <div className="bg-destructive/10 border border-destructive/40 rounded-xl p-4 flex items-start gap-3">
              <X className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">Research failed</p>
                <p className="text-xs text-destructive/80 mt-0.5">{activeSession.error}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive/80 h-7"
                onClick={handleNewResearch}
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Query input (hidden while researching) */}
          {!isResearching && (
            <>
              {/* Query textarea */}
              <div className="space-y-2">
                <label htmlFor="research-query" className="text-sm font-medium text-foreground">
                  What would you like to research?
                </label>
                <Textarea
                  id="research-query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter your research topic or question..."
                  rows={4}
                  className="bg-card border-border text-foreground placeholder:text-muted-foreground resize-none focus-visible:ring-ring focus-visible:border-ring"
                />
              </div>

              {/* Suggested topics */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Suggested topics
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_TOPICS.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => handleSuggestedTopic(topic)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs border transition-colors',
                        query === topic
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
                      )}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>

              {/* Research depth */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Research depth</p>
                <div className="flex gap-3">
                  {DEPTH_OPTIONS.map((option) => (
                    <DepthCard
                      key={option.id}
                      option={option}
                      selected={depth === option.id}
                      onSelect={setDepth}
                    />
                  ))}
                </div>
              </div>

              {/* Start button */}
              <Button
                onClick={handleStartResearch}
                disabled={!query.trim()}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium h-11 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Search className="h-4 w-4 mr-2" />
                Start Research
              </Button>
            </>
          )}
        </div>
      </ScrollArea>

      {/* History sidebar */}
      {recentHistory.length > 0 && (
        <aside className="w-72 border-l border-border flex flex-col shrink-0">
          <div className="px-4 py-4 border-b border-border">
            <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recent Research
            </h2>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-0.5">
              {recentHistory.map((entry) => (
                <HistoryItem key={entry.id} entry={entry} onClick={handleHistoryClick} />
              ))}
            </div>
          </ScrollArea>
        </aside>
      )}
    </div>
  );
}

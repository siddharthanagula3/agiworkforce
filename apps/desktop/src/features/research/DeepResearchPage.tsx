import { useState, useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Telescope, Search, X, Zap, BarChart2, Layers } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/ui/Button';
import { Textarea } from '@/ui/Textarea';
import { ScrollArea } from '@/ui/ScrollArea';
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
import { ResearchReport } from './ResearchReport';
import { ResearchHistory } from './ResearchHistory';

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

  useEffect(() => {
    initialize().catch((err: unknown) => {
      console.error('Failed to initialize research store:', err);
    });
  }, [initialize]);

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

          {/*
            Active session: result.
            This used to be an inline block that showed only the summary and key
            findings — the actual report body, its citations, copy, and PDF
            export were unreachable, even though a complete component for them
            already existed in this directory taking exactly the store's
            `ResearchResponse`. A finished research run that will not show you
            its report is the whole feature failing at the last step.
          */}
          {showResult && activeSession.result && (
            <ResearchReport result={activeSession.result} onNewResearch={handleNewResearch} />
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

      {/*
        History sidebar. `ResearchHistory` reads the same store slice the inline
        list did, and adds the parts the inline version never had: search across
        past runs, delete-one, clear-all, and a detail dialog.
      */}
      {recentHistory.length > 0 && (
        <aside className="w-72 border-l border-border flex flex-col shrink-0">
          <ResearchHistory className="flex-1" onSelectEntry={handleHistoryClick} />
        </aside>
      )}
    </div>
  );
}

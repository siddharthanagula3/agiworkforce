/**
 * DeepResearchPage Component
 *
 * Dedicated deep research page with:
 * - Large query input with research topic suggestions
 * - Site scoping (limit search to specific domains)
 * - Research depth selector (Quick / Standard / Deep)
 * - Live progress visualization while a session is active
 * - Recent research history
 */
import { useState, useCallback, useRef, useEffect, KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Telescope,
  Search,
  Globe,
  X,
  Plus,
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
import { Input } from '@/components/ui/Input';
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
  'AI adoption trends in enterprise 2025',
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
    sources: '3-5 sources',
    icon: Zap,
    estimatedTime: '~30s',
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Balanced depth and speed',
    sources: '10-15 sources',
    icon: BarChart2,
    estimatedTime: '~2m',
  },
  {
    id: 'deep',
    label: 'Deep',
    description: 'Comprehensive multi-angle analysis',
    sources: '20+ sources',
    icon: Layers,
    estimatedTime: '~5m',
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

interface DomainChipProps {
  domain: string;
  onRemove: (domain: string) => void;
}

function DomainChip({ domain, onRemove }: DomainChipProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded-md text-xs text-zinc-300">
      <Globe className="h-3 w-3 text-zinc-500 shrink-0" />
      {domain}
      <button
        type="button"
        className="ml-0.5 text-zinc-500 hover:text-white transition-colors"
        onClick={() => onRemove(domain)}
        aria-label={`Remove ${domain}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

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
          ? 'border-teal-500 bg-teal-500/10 text-white'
          : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', selected ? 'text-teal-400' : 'text-zinc-500')} />
        <span className="text-sm font-medium">{option.label}</span>
      </div>
      <p className="text-xs leading-snug">{option.description}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-zinc-500">{option.sources}</span>
        <span className="text-zinc-600">·</span>
        <span className="text-xs text-zinc-500">{option.estimatedTime}</span>
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
      className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-zinc-800/60 transition-colors text-left group"
    >
      <div className="shrink-0 mt-0.5 w-8 h-8 flex items-center justify-center rounded-md bg-zinc-800">
        <BookOpen className="h-4 w-4 text-teal-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 font-medium truncate">{entry.query}</p>
        <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{entry.summary}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <Badge variant="secondary" className="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0">
            {MODE_LABELS[entry.mode] ?? entry.mode}
          </Badge>
          <span className="text-xs text-zinc-600 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(entry.timestamp)}
          </span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 shrink-0 mt-1 transition-colors" />
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

function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
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
  const [domains, setDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState('');
  const domainInputRef = useRef<HTMLInputElement>(null);

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

  const handleAddDomain = useCallback(() => {
    const normalized = normalizeDomain(domainInput);
    if (!normalized) return;
    if (domains.includes(normalized)) {
      setDomainInput('');
      return;
    }
    setDomains((prev) => [...prev, normalized]);
    setDomainInput('');
  }, [domainInput, domains]);

  const handleDomainKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        handleAddDomain();
      }
      if (e.key === 'Backspace' && domainInput === '' && domains.length > 0) {
        setDomains((prev) => prev.slice(0, -1));
      }
    },
    [handleAddDomain, domainInput, domains],
  );

  const handleRemoveDomain = useCallback((domain: string) => {
    setDomains((prev) => prev.filter((d) => d !== domain));
  }, []);

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
    setDomains([]);
    setDomainInput('');
  }, [resetSession]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const showProgress = isResearching && activeSession.progress !== null;
  const showResult = activeSession.status === 'complete' && activeSession.result !== null;
  const showError = activeSession.status === 'error' && activeSession.error !== null;
  const recentHistory = history.slice(0, 5);

  return (
    <div className={cn('flex h-full bg-zinc-950', className)}>
      {/* Main panel */}
      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
          {/* Page header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/15 flex items-center justify-center">
              <Telescope className="h-5 w-5 text-teal-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">Deep Research</h1>
              <p className="text-sm text-zinc-500">Multi-source AI research with cited findings</p>
            </div>
          </div>

          {/* Active session: progress */}
          {showProgress && activeSession.progress && (
            <ResearchProgress progress={activeSession.progress} onCancel={handleCancel} />
          )}

          {/* Active session: result */}
          {showResult && activeSession.result && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-teal-400" />
                  <span className="text-sm font-semibold text-white">Research Complete</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-zinc-400 hover:text-white h-7"
                  onClick={handleNewResearch}
                >
                  New Research
                </Button>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">
                {activeSession.result.summary}
              </p>
              {activeSession.result.key_findings.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                    Key Findings
                  </h4>
                  <ul className="space-y-1.5">
                    {activeSession.result.key_findings.map((finding, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-zinc-400">
                        <ChevronRight className="h-4 w-4 shrink-0 text-teal-500 mt-0.5" />
                        <span>{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-center gap-4 pt-1 text-xs text-zinc-600 border-t border-zinc-800">
                <span>{activeSession.result.sources_cited} sources cited</span>
                <span>{activeSession.result.citations_count} citations</span>
                <span className="capitalize">{activeSession.result.confidence} confidence</span>
              </div>
            </div>
          )}

          {/* Active session: error */}
          {showError && (
            <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-4 flex items-start gap-3">
              <X className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-300">Research failed</p>
                <p className="text-xs text-red-400/80 mt-0.5">{activeSession.error}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-300 h-7"
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
                <label htmlFor="research-query" className="text-sm font-medium text-zinc-300">
                  What would you like to research?
                </label>
                <Textarea
                  id="research-query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter your research topic or question..."
                  rows={4}
                  className="bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-600 resize-none focus-visible:ring-teal-500/50 focus-visible:border-teal-500/50"
                />
              </div>

              {/* Suggested topics */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
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
                          ? 'border-teal-500 bg-teal-500/10 text-teal-300'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300',
                      )}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>

              {/* Site scoping */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-zinc-500" />
                  Limit to these sites
                  <span className="text-xs font-normal text-zinc-600">(optional)</span>
                </label>
                <div className="flex flex-wrap items-center gap-2 min-h-[40px] p-2.5 bg-zinc-900 border border-zinc-700 rounded-md focus-within:ring-2 focus-within:ring-teal-500/40 focus-within:border-teal-500/50 transition-colors">
                  {domains.map((domain) => (
                    <DomainChip key={domain} domain={domain} onRemove={handleRemoveDomain} />
                  ))}
                  <div className="flex items-center gap-1 flex-1 min-w-[140px]">
                    <Input
                      ref={domainInputRef}
                      value={domainInput}
                      onChange={(e) => setDomainInput(e.target.value)}
                      onKeyDown={handleDomainKeyDown}
                      onBlur={handleAddDomain}
                      placeholder={
                        domains.length === 0 ? 'e.g. arxiv.org, nature.com' : 'Add site...'
                      }
                      className="border-0 bg-transparent p-0 h-auto text-xs text-zinc-300 placeholder:text-zinc-600 focus-visible:ring-0 shadow-none"
                    />
                    {domainInput.trim() && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-zinc-500 hover:text-teal-400"
                        onClick={handleAddDomain}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                {domains.length > 0 && (
                  <p className="text-xs text-zinc-600">
                    Research will prioritize content from {domains.length} scoped{' '}
                    {domains.length === 1 ? 'site' : 'sites'}.
                  </p>
                )}
              </div>

              {/* Research depth */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-zinc-300">Research depth</p>
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
                className="w-full bg-teal-600 hover:bg-teal-500 text-white font-medium h-11 disabled:opacity-40 disabled:cursor-not-allowed"
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
        <aside className="w-72 border-l border-zinc-800 flex flex-col shrink-0">
          <div className="px-4 py-4 border-b border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Clock className="h-4 w-4 text-zinc-500" />
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

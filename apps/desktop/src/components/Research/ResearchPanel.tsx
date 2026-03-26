/**
 * ResearchPanel Component
 *
 * A comprehensive research panel that connects to the Tauri backend
 * for conducting deep, multi-source research investigations.
 *
 * Features:
 * - Research query input with mode selection
 * - Real-time progress tracking via events
 * - Source analysis with status indicators
 * - Findings display with key points
 * - Export to markdown functionality
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Search,
  Loader2,
  BookOpen,
  Globe,
  FileText,
  Mail,
  Calendar,
  Brain,
  CheckCircle2,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Sparkles,
  Zap,
  Timer,
  BookMarked,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Progress } from '@/components/ui/Progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils';
import { invoke, listen, isTauri } from '@/lib/tauri-mock';
import { getSimpleErrorMessage } from '@/lib/errorMessages';

// Types matching the Rust backend
export type ResearchModeId = 'quick' | 'standard' | 'deep' | 'exhaustive';

export interface ResearchMode {
  id: ResearchModeId;
  name: string;
  description: string;
  estimated_time: string;
}

export interface ResearchSource {
  url: string;
  title: string;
  domain?: string;
  status: 'pending' | 'analyzing' | 'done' | 'failed';
  relevance?: number;
}

export interface ResearchFinding {
  source: string;
  key_points: string[];
  summary: string;
  confidence?: string;
}

export interface ResearchProgress {
  session_id: string;
  phase: string;
  progress_percent: number;
  status_message: string;
  sources_found: number;
  iterations_completed: number;
  total_iterations: number;
  active_agents: string[];
  elapsed_secs: number;
  estimated_remaining_secs?: number;
  cancelled: boolean;
}

export interface ResearchResponse {
  session_id: string;
  query: string;
  mode: string;
  report: string;
  summary: string;
  key_findings: string[];
  citations_count: number;
  confidence: string;
  duration_secs: number;
  sources_examined: number;
  sources_cited: number;
}

export interface ResearchState {
  query: string;
  mode: ResearchModeId;
  status: 'idle' | 'researching' | 'complete' | 'error';
  progress: ResearchProgress | null;
  sources: ResearchSource[];
  findings: ResearchFinding[];
  result: ResearchResponse | null;
  error: string | null;
}

const RESEARCH_MODES: ResearchMode[] = [
  {
    id: 'quick',
    name: 'Quick',
    description: 'Fast search, top results only',
    estimated_time: '30s - 2min',
  },
  {
    id: 'standard',
    name: 'Standard',
    description: 'Balanced research, moderate depth',
    estimated_time: '2 - 10min',
  },
  {
    id: 'deep',
    name: 'Deep',
    description: 'Comprehensive investigation',
    estimated_time: '5 - 30min',
  },
  {
    id: 'exhaustive',
    name: 'Exhaustive',
    description: 'Maximum depth, all sources',
    estimated_time: '15 - 60min',
  },
];

const AGENT_ICONS: Record<string, typeof Globe> = {
  web_search: Globe,
  document_search: FileText,
  email_search: Mail,
  calendar_search: Calendar,
  memory_search: Brain,
};

const PHASE_LABELS: Record<string, string> = {
  initializing: 'Setting up...',
  analyzing_query: 'Analyzing your question...',
  searching: 'Searching across sources...',
  collecting_results: 'Gathering findings...',
  synthesizing: 'Synthesizing insights...',
  generating_report: 'Writing report...',
  complete: 'Research complete',
  failed: 'Research failed',
  cancelled: 'Research cancelled',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  very_low: 'bg-red-500/10 text-red-500 border-red-500/20',
  low: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  high: 'bg-green-500/10 text-green-500 border-green-500/20',
  very_high: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
};

export interface ResearchPanelProps {
  className?: string;
  initialQuery?: string;
  onResearchComplete?: (result: ResearchResponse) => void;
}

export const ResearchPanel = memo(function ResearchPanel({
  className,
  initialQuery = '',
  onResearchComplete,
}: ResearchPanelProps) {
  const [state, setState] = useState<ResearchState>({
    query: initialQuery,
    mode: 'standard',
    status: 'idle',
    progress: null,
    sources: [],
    findings: [],
    result: null,
    error: null,
  });

  const [activeTab, setActiveTab] = useState<'progress' | 'report'>('progress');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Bug #401 fix: Store unlisten promises and clean up properly on unmount
  // to prevent memory leaks from unresolved listener promises.
  useEffect(() => {
    if (!isTauri) return;

    let isMounted = true;
    const unlistenFns: Array<() => void> = [];

    const setupListeners = async () => {
      try {
        const unlistenProgress = await listen<ResearchProgress>('research:progress', (event) => {
          if (!isMounted) return;
          setState((prev) => ({
            ...prev,
            progress: event.payload,
            status: 'researching',
          }));

          // Auto-scroll during progress
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        });
        if (isMounted) {
          unlistenFns.push(unlistenProgress);
        } else {
          unlistenProgress();
        }

        const unlistenError = await listen<{ query: string; error: string }>(
          'research:error',
          (event) => {
            if (!isMounted) return;
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: event.payload.error,
            }));
          },
        );
        if (isMounted) {
          unlistenFns.push(unlistenError);
        } else {
          unlistenError();
        }
      } catch (err) {
        console.error('[ResearchPanel] Failed to setup event listeners:', err);
      }
    };

    setupListeners();

    return () => {
      isMounted = false;
      unlistenFns.forEach((unlisten) => {
        try {
          unlisten();
        } catch (err) {
          console.warn('[ResearchPanel] Error during listener cleanup:', err);
        }
      });
    };
  }, []);

  const handleStartResearch = useCallback(async () => {
    const trimmedQuery = state.query.trim();
    if (!trimmedQuery) return;

    setState((prev) => ({
      ...prev,
      status: 'researching',
      progress: null,
      sources: [],
      findings: [],
      result: null,
      error: null,
    }));
    setActiveTab('progress');

    try {
      const result = await invoke<ResearchResponse>('research_start', {
        request: {
          query: trimmedQuery,
          mode: state.mode,
        },
      });

      setState((prev) => ({
        ...prev,
        status: 'complete',
        result,
      }));
      setActiveTab('report');
      onResearchComplete?.(result);
    } catch (error) {
      const errorMessage = getSimpleErrorMessage(error);
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: errorMessage,
      }));
    }
  }, [state.query, state.mode, onResearchComplete]);

  const handleExportMarkdown = useCallback(() => {
    if (!state.result) return;

    const markdown = `# Research Report: ${state.result.query}

## Summary
${state.result.summary}

## Key Findings
${state.result.key_findings.map((f) => `- ${f}`).join('\n')}

## Full Report
${state.result.report}

---
*Research completed in ${formatDuration(state.result.duration_secs)}*
*Mode: ${state.result.mode} | Sources cited: ${state.result.sources_cited} | Confidence: ${state.result.confidence}*
`;

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `research-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, [state.result]);

  const handleReset = useCallback(() => {
    setState({
      query: '',
      mode: 'standard',
      status: 'idle',
      progress: null,
      sources: [],
      findings: [],
      result: null,
      error: null,
    });
    setActiveTab('progress');
  }, []);

  const isResearching = state.status === 'researching';
  const hasResult = state.status === 'complete' && state.result;

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Research</h2>
          {state.progress && (
            <Badge variant="outline" className="ml-auto">
              {state.progress.sources_found} sources found
            </Badge>
          )}
        </div>
      </div>

      {/* Search Input */}
      <div className="border-b p-4">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="What would you like to research?"
                value={state.query}
                onChange={(e) => setState((prev) => ({ ...prev, query: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isResearching) {
                    handleStartResearch();
                  }
                }}
                disabled={isResearching}
                className="pl-10"
              />
            </div>
            <Select
              value={state.mode}
              onValueChange={(value) =>
                setState((prev) => ({ ...prev, mode: value as ResearchModeId }))
              }
              disabled={isResearching}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESEARCH_MODES.map((mode) => (
                  <SelectItem key={mode.id} value={mode.id}>
                    <div className="flex items-center gap-2">
                      {mode.id === 'quick' && <Zap className="h-3 w-3" />}
                      {mode.id === 'standard' && <Timer className="h-3 w-3" />}
                      {mode.id === 'deep' && <BookMarked className="h-3 w-3" />}
                      {mode.id === 'exhaustive' && <Sparkles className="h-3 w-3" />}
                      {mode.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mode description */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{RESEARCH_MODES.find((m) => m.id === state.mode)?.description}</span>
            <span>
              Est. time: {RESEARCH_MODES.find((m) => m.id === state.mode)?.estimated_time}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleStartResearch}
              disabled={!state.query.trim() || isResearching}
              className="flex-1"
            >
              {isResearching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Researching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Start Research
                </>
              )}
            </Button>
            {(hasResult || state.error) && (
              <Button variant="outline" onClick={handleReset}>
                <RefreshCw className="mr-2 h-4 w-4" />
                New Research
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Error State */}
      {state.error && (
        <div className="m-4 flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Research failed</p>
            <p className="text-sm text-muted-foreground">{state.error}</p>
          </div>
        </div>
      )}

      {/* Content Tabs */}
      {(isResearching || hasResult) && (
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="border-b px-4">
            <TabsList className="h-10">
              <TabsTrigger value="progress" className="gap-2">
                {isResearching && <Loader2 className="h-3 w-3 animate-spin" />}
                Progress
              </TabsTrigger>
              <TabsTrigger value="report" disabled={!hasResult} className="gap-2">
                <FileText className="h-3 w-3" />
                Report
                {hasResult && (
                  <Badge variant="secondary" className="ml-1 h-5 text-xs">
                    {state.result?.key_findings.length} findings
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="progress" className="flex-1 overflow-hidden m-0">
            <ScrollArea ref={scrollRef} className="h-full">
              <div className="p-4 space-y-4">
                {/* Progress Overview */}
                {state.progress && <ProgressOverview progress={state.progress} />}

                {/* Active Agents */}
                {state.progress && state.progress.active_agents.length > 0 && (
                  <ActiveAgents agents={state.progress.active_agents} />
                )}

                {/* Placeholder when idle */}
                {state.status === 'idle' && <IdlePlaceholder />}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="report" className="flex-1 overflow-hidden m-0">
            {hasResult && (
              <ScrollArea className="h-full">
                <div className="p-4 space-y-6">
                  <ResearchReport result={state.result!} onExport={handleExportMarkdown} />
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Idle State */}
      {state.status === 'idle' && !state.error && (
        <div className="flex-1 flex items-center justify-center p-8">
          <IdlePlaceholder />
        </div>
      )}
    </div>
  );
});

// Sub-components

function ProgressOverview({ progress }: { progress: ResearchProgress }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            {PHASE_LABELS[progress.phase] || progress.status_message}
          </CardTitle>
          <span className="text-sm text-muted-foreground">{progress.progress_percent}%</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={progress.progress_percent} className="h-2" />
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Sources</p>
            <p className="font-medium">{progress.sources_found}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Iterations</p>
            <p className="font-medium">
              {progress.iterations_completed}/{progress.total_iterations}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Elapsed</p>
            <p className="font-medium">{formatDuration(progress.elapsed_secs)}</p>
          </div>
        </div>
        {progress.estimated_remaining_secs !== undefined &&
          progress.estimated_remaining_secs > 0 && (
            <p className="text-xs text-muted-foreground">
              Estimated time remaining: {formatDuration(progress.estimated_remaining_secs)}
            </p>
          )}
      </CardContent>
    </Card>
  );
}

function ActiveAgents({ agents }: { agents: string[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Active Search Agents</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {agents.map((agent) => {
            const Icon = AGENT_ICONS[agent] || Search;
            return (
              <Badge key={agent} variant="outline" className="flex items-center gap-1.5 px-3 py-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                <Icon className="h-3 w-3" />
                {formatAgentName(agent)}
              </Badge>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ResearchReport({ result, onExport }: { result: ResearchResponse; onExport: () => void }) {
  const [showFullReport, setShowFullReport] = useState(false);

  return (
    <>
      {/* Summary Card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base">Summary</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Completed in {formatDuration(result.duration_secs)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'capitalize',
                  CONFIDENCE_COLORS[result.confidence] || CONFIDENCE_COLORS['medium'],
                )}
              >
                {result.confidence.replace('_', ' ')} confidence
              </Badge>
              <Button variant="outline" size="sm" onClick={onExport}>
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{result.summary}</p>
          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span>{result.sources_examined} sources examined</span>
            <span>{result.sources_cited} sources cited</span>
            <span>{result.citations_count} citations</span>
          </div>
        </CardContent>
      </Card>

      {/* Key Findings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Key Findings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {result.key_findings.map((finding, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
                <span>{finding}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Full Report */}
      <Collapsible open={showFullReport} onOpenChange={setShowFullReport}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-2 cursor-pointer hover:bg-accent/50 transition-colors">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Full Report
                </span>
                {showFullReport ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.report}</ReactMarkdown>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </>
  );
}

function IdlePlaceholder() {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <BookOpen className="h-6 w-6 text-primary" />
      </div>
      <h3 className="font-medium text-foreground">Deep Research Mode</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
        Enter a topic or question to conduct comprehensive research across multiple sources. AGI
        Workforce will analyze, synthesize, and present key findings with citations.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Badge variant="outline" className="text-xs">
          <Globe className="mr-1 h-3 w-3" />
          Web Search
        </Badge>
        <Badge variant="outline" className="text-xs">
          <FileText className="mr-1 h-3 w-3" />
          Documents
        </Badge>
        <Badge variant="outline" className="text-xs">
          <Brain className="mr-1 h-3 w-3" />
          Memory
        </Badge>
      </div>
    </div>
  );
}

// Utility functions

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

function formatAgentName(agent: string): string {
  return agent
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default ResearchPanel;

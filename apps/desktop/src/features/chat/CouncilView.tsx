import { useState, useCallback, useEffect } from 'react';
import {
  Users,
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  CheckCircle2,
  XCircle,
  BarChart3,
  History,
} from 'lucide-react';
import type { CouncilResult, CouncilMemberResponse } from '../../api/council';
import { useCouncilStore, selectIsCouncilQuerying } from '../../stores/councilStore';

interface CouncilViewProps {
  onClose?: () => void;
  /** Optional initial prompt to pre-fill (e.g. from chat composer) */
  initialPrompt?: string;
  /** Callback when consensus is ready — used to insert into chat */
  onConsensusReady?: (consensus: string, result: CouncilResult) => void;
}

export function CouncilView({ onClose, initialPrompt, onConsensusReady }: CouncilViewProps) {
  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const result = useCouncilStore((s) => s.result);
  const error = useCouncilStore((s) => s.error);
  const loading = useCouncilStore(selectIsCouncilQuerying);
  const history = useCouncilStore((s) => s.history);
  const startCouncil = useCouncilStore((s) => s.startCouncil);
  const clearCouncil = useCouncilStore((s) => s.clearCouncil);

  // Sync initial prompt when it changes externally
  useEffect(() => {
    if (initialPrompt) {
      setPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  const handleQuery = useCallback(async () => {
    if (!prompt.trim()) return;
    const councilResult = await startCouncil({
      prompt,
      synthesizeConsensus: true,
    });
    if (councilResult && onConsensusReady) {
      onConsensusReady(councilResult.consensusSummary, councilResult);
    }
  }, [prompt, startCouncil, onConsensusReady]);

  const toggleExpand = (key: string) => {
    setExpandedModel((prev) => (prev === key ? null : key));
  };

  const handleNewQuery = () => {
    clearCouncil();
    setPrompt('');
  };

  // View a historical result without re-querying
  const viewHistoryItem = (item: CouncilResult) => {
    useCouncilStore.setState({ result: item, status: 'done' });
    setShowHistory(false);
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
          <Users className="h-4 w-4" />
          Model Council
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="View history"
            >
              <History className="h-3.5 w-3.5" />
              {history.length}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* History dropdown */}
      {showHistory && (
        <div className="rounded-md border border-border/30 bg-background/80 p-2 max-h-40 overflow-y-auto">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Recent queries</div>
          {history.map((item, i) => (
            <button
              key={`${item.query}-${i}`}
              onClick={() => viewHistoryItem(item)}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent/50 truncate transition-colors"
            >
              {item.query}
            </button>
          ))}
        </div>
      )}

      {!result && (
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && handleQuery()}
            placeholder="Ask multiple models the same question..."
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={loading}
          />
          <button
            onClick={handleQuery}
            disabled={!prompt.trim() || loading}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            {loading ? 'Querying...' : 'Ask Council'}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          {/* Query display */}
          <div className="text-xs text-muted-foreground">
            Query: <span className="text-foreground/70">{result.query}</span>
          </div>

          {/* Stats bar */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              {result.successfulCount} succeeded
            </span>
            {result.failedCount > 0 && (
              <span className="flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5 text-red-500" />
                {result.failedCount} failed
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {(result.totalLatencyMs / 1000).toFixed(1)}s
            </span>
            <span className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" />${result.totalCost.toFixed(4)}
            </span>
            <span className="flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5" />
              Agreement: {(result.agreementScore * 100).toFixed(0)}%
            </span>
          </div>

          {/* Consensus summary */}
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
            <div className="mb-1 text-xs font-medium text-primary">Consensus Summary</div>
            <div className="whitespace-pre-wrap text-sm text-foreground/90">
              {result.consensusSummary}
            </div>
            {onConsensusReady && (
              <button
                onClick={() => onConsensusReady(result.consensusSummary, result)}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Insert consensus into chat
              </button>
            )}
          </div>

          {/* Individual responses */}
          <div className="flex flex-col gap-1">
            {result.responses.map((resp: CouncilMemberResponse) => {
              const key = `${resp.provider}/${resp.model}`;
              const isExpanded = expandedModel === key;
              return (
                <div key={key} className="rounded-md border border-border/30 bg-background/50">
                  <button
                    onClick={() => toggleExpand(key)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                  >
                    {resp.error ? (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                    )}
                    <span className="flex-1 font-medium">{key}</span>
                    <span className="text-xs text-muted-foreground">
                      {resp.tokens > 0 && `${resp.tokens} tokens · `}
                      {(resp.latencyMs / 1000).toFixed(1)}s
                      {resp.cost > 0 && ` · $${resp.cost.toFixed(4)}`}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border/20 px-3 py-2">
                      {resp.error ? (
                        <div className="text-sm text-destructive">{resp.error}</div>
                      ) : (
                        <div className="whitespace-pre-wrap text-sm text-foreground/80">
                          {resp.content}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* New query button */}
          <button
            onClick={handleNewQuery}
            className="self-start text-xs text-primary hover:underline"
          >
            New council query
          </button>
        </div>
      )}
    </div>
  );
}

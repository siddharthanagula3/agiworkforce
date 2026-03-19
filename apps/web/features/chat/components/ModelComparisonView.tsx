'use client';

/**
 * ModelComparisonView - Side-by-side comparison of multiple LLM responses
 *
 * Inspired by Perplexity's Model Council. Sends the same prompt to 2-3 models
 * simultaneously and renders their streaming responses in columns. Each column
 * shows model name, streaming response, elapsed time, and token count. A
 * "Pick winner" button lets the user vote for the best answer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Clock, Hash, Loader2, Square, Trophy, X } from 'lucide-react';
import { Button } from '@shared/ui/button';
import { ScrollArea } from '@shared/ui/scroll-area';
import { Badge } from '@shared/ui/badge';
import { cn } from '@shared/lib/utils';
import { toast } from 'sonner';
import { type AIModel, AVAILABLE_MODELS } from '@shared/stores/model-store';
import { logger } from '@shared/lib/logger';

// ---------------------------------------------------------------------------
// Provider colors (reuse from session page)
// ---------------------------------------------------------------------------

const PROVIDER_COLORS: Record<string, string> = {
  OpenAI: 'bg-emerald-500',
  Anthropic: 'bg-orange-400',
  Google: 'bg-blue-500',
  DeepSeek: 'bg-indigo-500',
  Perplexity: 'bg-teal-500',
  xAI: 'bg-zinc-400',
  Mistral: 'bg-violet-500',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModelColumnState {
  modelId: string;
  content: string;
  isStreaming: boolean;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** Rough token estimate: ~4 chars per token */
  estimatedTokens: number;
}

export interface ModelComparisonViewProps {
  /** The prompt to send to all selected models */
  prompt: string;
  /** The models to compare (2-3) */
  models: AIModel[];
  /** Conversation history to provide context */
  conversationHistory: Array<{ role: string; content: string }>;
  /** Session ID for the ChatAIService call */
  sessionId: string;
  /** Called when user closes the comparison view */
  onClose: () => void;
  /** Called when user picks a winner */
  onPickWinner?: (modelId: string, response: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  // Rough GPT-style estimate: ~4 characters per token
  return Math.max(0, Math.ceil(text.length / 4));
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Single model response column
// ---------------------------------------------------------------------------

function ModelColumn({
  state,
  model,
  isWinner,
  onPick,
  onStop,
}: {
  state: ModelColumnState;
  model: AIModel;
  isWinner: boolean;
  onPick: () => void;
  onStop: () => void;
}) {
  const dot = PROVIDER_COLORS[model.provider] ?? 'bg-muted-foreground';
  const elapsed =
    state.startedAt != null
      ? state.finishedAt != null
        ? state.finishedAt - state.startedAt
        : Date.now() - state.startedAt
      : null;

  // Live-update the timer every 100ms while streaming
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!state.isStreaming) return;
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [state.isStreaming]);

  return (
    <div
      className={cn(
        'flex flex-1 flex-col rounded-lg border bg-background transition-colors',
        isWinner ? 'border-primary ring-2 ring-primary/20' : 'border-border/50',
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          <span className="text-sm font-medium truncate">{model.name}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {model.provider}
          </Badge>
        </div>
        {isWinner && <Trophy className="h-4 w-4 shrink-0 text-primary" aria-label="Winner" />}
      </div>

      {/* Response body */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 py-3 text-sm leading-relaxed">
          {state.error ? (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
              <X className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          ) : state.content ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{state.content}</ReactMarkdown>
              {state.isStreaming && (
                <span className="inline-block h-4 w-1.5 animate-pulse bg-foreground/70 align-text-bottom" />
              )}
            </div>
          ) : state.isStreaming ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating...</span>
            </div>
          ) : null}
        </div>
      </ScrollArea>

      {/* Footer: stats + actions */}
      <div className="flex items-center justify-between border-t border-border/30 px-3 py-2">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {elapsed != null && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatElapsed(elapsed)}
            </span>
          )}
          {state.estimatedTokens > 0 && (
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {state.estimatedTokens.toLocaleString()} tokens
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {state.isStreaming && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onStop}
              aria-label={`Stop ${model.name}`}
            >
              <Square className="mr-1 h-3 w-3 fill-current" />
              Stop
            </Button>
          )}
          {!state.isStreaming && state.content && !isWinner && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onPick}
              aria-label={`Pick ${model.name} as winner`}
            >
              <Check className="mr-1 h-3 w-3" />
              Pick
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main comparison view
// ---------------------------------------------------------------------------

export function ModelComparisonView({
  prompt,
  models,
  conversationHistory,
  sessionId: _sessionId,
  onClose,
  onPickWinner,
}: ModelComparisonViewProps) {
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);

  // Column states keyed by model ID
  const [columns, setColumns] = useState<Record<string, ModelColumnState>>(() => {
    const initial: Record<string, ModelColumnState> = {};
    for (const m of models) {
      initial[m.id] = {
        modelId: m.id,
        content: '',
        isStreaming: false,
        error: null,
        startedAt: null,
        finishedAt: null,
        estimatedTokens: 0,
      };
    }
    return initial;
  });

  const modelsById = useMemo(() => {
    const map: Record<string, AIModel> = {};
    for (const m of AVAILABLE_MODELS) {
      map[m.id] = m;
    }
    return map;
  }, []);

  // Start all model requests in parallel on mount
  useEffect(() => {
    let cancelled = false;

    async function runModel(modelId: string) {
      const controller = new AbortController();
      abortControllersRef.current.set(modelId, controller);

      setColumns((prev) => ({
        ...prev,
        [modelId]: {
          ...prev[modelId]!,
          isStreaming: true,
          startedAt: Date.now(),
        },
      }));

      try {
        const token = await getAuthTokenSafe();
        if (cancelled) return;

        const messages = [
          ...conversationHistory.map((msg) => ({
            role: msg.role as 'user' | 'assistant' | 'system',
            content: msg.content,
          })),
          { role: 'user' as const, content: prompt },
        ];

        const { addCsrfHeaders } = await import('@/lib/client/csrf');
        const headers = await addCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        });

        const response = await fetch('/api/llm/v1/chat/completions', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: modelId,
            messages,
            stream: true,
            max_tokens: 4096,
            temperature: 0.7,
            metadata: { model: modelId },
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({ error: 'Request failed' }))) as {
            error?: string;
          };
          throw new Error(errorData.error || `API error ${response.status}`);
        }

        if (!response.body) {
          const data = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const text = data.choices?.[0]?.message?.content || '';
          if (cancelled) return;
          setColumns((prev) => ({
            ...prev,
            [modelId]: {
              ...prev[modelId]!,
              content: text,
              isStreaming: false,
              finishedAt: Date.now(),
              estimatedTokens: estimateTokens(text),
            },
          }));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (cancelled) {
            reader.cancel();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const jsonStr = trimmed.slice(6).trim();
            if (jsonStr === '[DONE]') continue;

            try {
              const event = JSON.parse(jsonStr) as {
                choices?: Array<{ delta?: { content?: string } }>;
                type?: string;
                delta?: { text?: string };
              };

              let piece: string | null = null;
              if (event.choices?.[0]?.delta?.content) {
                piece = event.choices[0].delta.content;
              } else if (
                event.type === 'content_block_delta' &&
                event.delta &&
                'text' in event.delta
              ) {
                piece = event.delta.text ?? null;
              }

              if (piece) {
                setColumns((prev) => {
                  const col = prev[modelId]!;
                  const newContent = col.content + piece;
                  return {
                    ...prev,
                    [modelId]: {
                      ...col,
                      content: newContent,
                      estimatedTokens: estimateTokens(newContent),
                    },
                  };
                });
              }
            } catch {
              // skip malformed SSE
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6).trim();
            if (jsonStr !== '[DONE]') {
              try {
                const event = JSON.parse(jsonStr) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const piece = event.choices?.[0]?.delta?.content;
                if (piece) {
                  setColumns((prev) => {
                    const col = prev[modelId]!;
                    const newContent = col.content + piece;
                    return {
                      ...prev,
                      [modelId]: {
                        ...col,
                        content: newContent,
                        estimatedTokens: estimateTokens(newContent),
                      },
                    };
                  });
                }
              } catch {
                // skip
              }
            }
          }
        }

        if (!cancelled) {
          setColumns((prev) => ({
            ...prev,
            [modelId]: {
              ...prev[modelId]!,
              isStreaming: false,
              finishedAt: Date.now(),
            },
          }));
        }
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error && err.name === 'AbortError'
            ? 'Generation stopped.'
            : err instanceof Error
              ? err.message
              : 'An unexpected error occurred';

        logger.error(`[ModelComparison] Error for ${modelId}:`, err);

        setColumns((prev) => ({
          ...prev,
          [modelId]: {
            ...prev[modelId]!,
            isStreaming: false,
            finishedAt: Date.now(),
            error: msg,
          },
        }));
      } finally {
        abortControllersRef.current.delete(modelId);
      }
    }

    // Fire all model requests simultaneously
    const promises = models.map((m) => runModel(m.id));
    const controllers = abortControllersRef.current;
    Promise.all(promises).then(() => {
      if (!cancelled) setAllDone(true);
    });

    return () => {
      cancelled = true;
      for (const [, controller] of controllers) {
        controller.abort();
      }
      controllers.clear();
    };
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStop = useCallback((modelId: string) => {
    const controller = abortControllersRef.current.get(modelId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(modelId);
    }
    setColumns((prev) => ({
      ...prev,
      [modelId]: {
        ...prev[modelId]!,
        isStreaming: false,
        finishedAt: Date.now(),
      },
    }));
  }, []);

  const handleStopAll = useCallback(() => {
    for (const [, controller] of abortControllersRef.current) {
      controller.abort();
    }
    abortControllersRef.current.clear();
    setColumns((prev) => {
      const updated = { ...prev };
      for (const id of Object.keys(updated)) {
        if (updated[id]!.isStreaming) {
          updated[id] = {
            ...updated[id]!,
            isStreaming: false,
            finishedAt: Date.now(),
          };
        }
      }
      return updated;
    });
  }, []);

  const handlePick = useCallback(
    (modelId: string) => {
      setWinnerId(modelId);
      const col = columns[modelId];
      if (col && onPickWinner) {
        onPickWinner(modelId, col.content);
      }
      const model = modelsById[modelId];
      toast.success(`${model?.name ?? modelId} selected as winner`);
    },
    [columns, modelsById, onPickWinner],
  );

  const anyStreaming = Object.values(columns).some((c) => c.isStreaming);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/30 px-4 py-2.5 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Model Comparison</span>
          <Badge variant="secondary" className="text-[10px]">
            {models.length} models
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {anyStreaming && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleStopAll}>
              <Square className="mr-1 h-3 w-3 fill-current" />
              Stop all
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onClose}
            aria-label="Close comparison"
          >
            <X className="mr-1 h-3 w-3" />
            Close
          </Button>
        </div>
      </div>

      {/* Prompt display */}
      <div className="border-b border-border/20 bg-muted/30 px-4 py-2.5">
        <p className="text-xs font-medium text-muted-foreground mb-1">Prompt</p>
        <p className="text-sm text-foreground line-clamp-3">{prompt}</p>
      </div>

      {/* Column grid */}
      <div
        className={cn(
          'flex flex-1 gap-3 overflow-hidden p-3',
          models.length === 2 && 'grid grid-cols-2',
          models.length >= 3 && 'grid grid-cols-3',
        )}
      >
        {models.map((model) => {
          const state = columns[model.id];
          if (!state) return null;
          return (
            <ModelColumn
              key={model.id}
              state={state}
              model={model}
              isWinner={winnerId === model.id}
              onPick={() => handlePick(model.id)}
              onStop={() => handleStop(model.id)}
            />
          );
        })}
      </div>

      {/* Bottom status bar */}
      {allDone && !winnerId && (
        <div className="flex items-center justify-center border-t border-border/30 px-4 py-3 bg-muted/20">
          <p className="text-sm text-muted-foreground">
            All models have responded. Pick the best answer above.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auth helper (avoids importing createClient at module top level)
// ---------------------------------------------------------------------------

async function getAuthTokenSafe(): Promise<string> {
  const { createClient } = await import('@/utils/supabase/client');
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated. Please sign in to continue.');
  }
  return session.access_token;
}

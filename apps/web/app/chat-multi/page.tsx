'use client';

/**
 * Multi-provider demo page — proves the new ProviderAdapter pipeline works
 * end-to-end through the web app.
 *
 * Lets the user pick a provider (anthropic | openai | ollama), type a prompt,
 * and see the streaming response with token usage. Three providers can each
 * stream independently against the same prompt for a side-by-side feel.
 *
 * Auth: pulls the Supabase session token at request time and forwards it as
 * a Bearer to the proxy. If you're not signed in, the api-gateway will
 * 401 and the chunk surface here will show the error.
 */

import { useEffect, useMemo, useState, type ReactElement } from 'react';

import { streamFromProvider } from '@/lib/providerStreamClient';
import type { ChatRequest, StreamChunk } from '@agiworkforce/types';
import { createClient } from '@/utils/supabase/client';

type ProviderId = 'anthropic' | 'openai' | 'ollama' | 'google';

const DEFAULT_MODEL_BY_PROVIDER: Record<ProviderId, string> = {
  anthropic: 'claude-haiku-4.5',
  openai: 'gpt-5.4-mini',
  ollama: 'llama3.2',
  google: 'gemini-3.1-flash-lite',
};

const PROVIDER_IDS: readonly ProviderId[] = ['anthropic', 'openai', 'google', 'ollama'] as const;

interface ProviderRunState {
  providerId: ProviderId;
  text: string;
  thinking: string;
  status: 'idle' | 'streaming' | 'done' | 'error';
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  startedAt?: number;
  endedAt?: number;
}

const initialState = (id: ProviderId): ProviderRunState => ({
  providerId: id,
  text: '',
  thinking: '',
  status: 'idle',
});

export default function MultiProviderChatPage(): ReactElement {
  const [prompt, setPrompt] = useState('Write a haiku about TypeScript.');
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<ProviderId, ProviderRunState>>({
    anthropic: initialState('anthropic'),
    openai: initialState('openai'),
    ollama: initialState('ollama'),
    google: initialState('google'),
  });
  const [busy, setBusy] = useState(false);

  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Supabase client unavailable');
      return null;
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    void (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setAuthError(error.message);
        return;
      }
      setAuthToken(data.session?.access_token ?? null);
    })();
  }, [supabase]);

  const updateRun = (id: ProviderId, patch: Partial<ProviderRunState>): void => {
    setRuns((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  /**
   * Apply a single StreamChunk to the run for `id`. Uses functional state
   * updates so concurrent text-delta chunks accumulate correctly even when
   * three providers stream in parallel.
   */
  const applyChunkToRun = (id: ProviderId, chunk: StreamChunk): void => {
    setRuns((prev) => {
      const current = prev[id];
      switch (chunk.type) {
        case 'text-delta':
          return { ...prev, [id]: { ...current, text: current.text + chunk.delta } };
        case 'thinking-delta':
          return { ...prev, [id]: { ...current, thinking: current.thinking + chunk.delta } };
        case 'usage':
          return {
            ...prev,
            [id]: {
              ...current,
              ...(chunk.inputTokens !== undefined ? { inputTokens: chunk.inputTokens } : {}),
              ...(chunk.outputTokens !== undefined ? { outputTokens: chunk.outputTokens } : {}),
            },
          };
        case 'stop':
          return {
            ...prev,
            [id]: {
              ...current,
              status: chunk.reason === 'error' ? 'error' : 'done',
              endedAt: Date.now(),
            },
          };
        case 'error':
          return {
            ...prev,
            [id]: { ...current, status: 'error', error: chunk.message, endedAt: Date.now() },
          };
        default:
          return prev;
      }
    });
  };

  const runProvider = async (id: ProviderId, ctrl: AbortController): Promise<void> => {
    if (!authToken) {
      updateRun(id, { status: 'error', error: 'Not signed in' });
      return;
    }
    updateRun(id, {
      ...initialState(id),
      status: 'streaming',
      startedAt: Date.now(),
    });
    const request: ChatRequest = {
      model: DEFAULT_MODEL_BY_PROVIDER[id],
      messages: [{ role: 'user', content: prompt }],
      maxOutputTokens: 256,
    };
    try {
      for await (const chunk of streamFromProvider({
        providerId: id,
        authToken,
        request,
        signal: ctrl.signal,
      })) {
        applyChunkToRun(id, chunk);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stream errored';
      updateRun(id, { status: 'error', error: message, endedAt: Date.now() });
    }
  };

  const onRun = async (): Promise<void> => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    const ctrl = new AbortController();
    await Promise.allSettled(PROVIDER_IDS.map((id) => runProvider(id, ctrl)));
    setBusy(false);
  };

  return (
    <main className="mx-auto max-w-5xl p-6 font-sans">
      <h1 className="text-2xl font-bold">Multi-provider chat (S8 demo)</h1>
      <p className="mt-2 text-sm text-gray-500">
        Sends the same prompt to Anthropic, OpenAI, and Ollama through the new{' '}
        <code className="rounded bg-gray-100 px-1 py-0.5">/api/v1/providers/:id/stream</code> route.
        Adapters live in{' '}
        <code className="rounded bg-gray-100 px-1 py-0.5">packages/providers/*</code>; cross-vendor
        payload shaping lives in{' '}
        <code className="rounded bg-gray-100 px-1 py-0.5">@agiworkforce/llm-normalize</code>.
      </p>

      {authError && <p className="mt-3 text-sm text-red-600">Auth: {authError}</p>}
      {!authError && !authToken && (
        <p className="mt-3 text-sm text-amber-600">Sign in to send requests.</p>
      )}

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        className="mt-4 w-full rounded border p-3 font-mono text-sm"
        placeholder="Type a prompt…"
      />
      <button
        type="button"
        disabled={busy || !authToken}
        onClick={() => void onRun()}
        className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Streaming…' : 'Run on all providers'}
      </button>

      <section className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PROVIDER_IDS.map((id) => (
          <ProviderCard key={id} run={runs[id]} />
        ))}
      </section>
    </main>
  );
}

function ProviderCard({ run }: { run: ProviderRunState }): ReactElement {
  const duration = run.endedAt && run.startedAt ? `${(run.endedAt - run.startedAt) / 1000}s` : '—';
  return (
    <article className="rounded border bg-white p-4 shadow-sm">
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="font-semibold capitalize">{run.providerId}</h2>
        <span className="text-xs text-gray-500">{run.status}</span>
      </header>
      {run.thinking && (
        <pre className="mb-2 whitespace-pre-wrap rounded bg-gray-50 p-2 text-[11px] italic text-gray-500">
          {run.thinking}
        </pre>
      )}
      <pre className="min-h-[8em] whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs">
        {run.text || (run.status === 'streaming' ? '…' : '')}
      </pre>
      {run.error && <p className="mt-2 text-xs text-red-600">Error: {run.error}</p>}
      <footer className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-gray-500">
        <span>in: {run.inputTokens ?? '—'}</span>
        <span>out: {run.outputTokens ?? '—'}</span>
        <span>{duration}</span>
      </footer>
    </article>
  );
}

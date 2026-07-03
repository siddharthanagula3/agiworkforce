/**
 * Local Runtime Settings — LM Studio and llama.cpp
 *
 * Mirrors the Ollama card in `./index.tsx` (URL config + installed/running state,
 * no fake availability) for the other two local OpenAI-compatible runtimes added
 * alongside Ollama. Self-contained: manages its own status-check state so it can
 * be dropped into the Local Models section without threading new props through
 * `SettingsPanel.tsx`'s existing Ollama-specific state machine.
 */
import React from 'react';
import { Check, Loader2, RefreshCw, Server } from 'lucide-react';
import { toast } from 'sonner';
import { validateUrl } from '@/utils/security';
import { invoke } from '@/lib/tauri-mock';
import { useSettingsStore } from '@/stores/settingsStore';

interface RemoteModel {
  id: string;
  name: string;
}

interface ProviderStatusResponse {
  available: boolean;
  configured: boolean;
  error?: string | null;
}

interface RuntimeConfig {
  key: 'lmstudio' | 'llamacpp';
  label: string;
  defaultUrl: string;
  docsHost: string;
  docsUrl: string;
  listCommand: string;
}

const RUNTIMES: RuntimeConfig[] = [
  {
    key: 'lmstudio',
    label: 'LM Studio',
    defaultUrl: 'http://localhost:1234/v1',
    docsHost: 'lmstudio.ai',
    docsUrl: 'https://lmstudio.ai',
    listCommand: 'llm_list_lmstudio_models',
  },
  {
    key: 'llamacpp',
    label: 'llama.cpp',
    defaultUrl: 'http://localhost:8080/v1',
    docsHost: 'github.com/ggml-org/llama.cpp',
    docsUrl: 'https://github.com/ggml-org/llama.cpp',
    listCommand: 'llm_list_llamacpp_models',
  },
];

function LocalRuntimeCard({ runtime }: { runtime: RuntimeConfig }) {
  const persistedUrl = useSettingsStore((state) =>
    runtime.key === 'lmstudio' ? state.llmConfig.lmstudioUrl : state.llmConfig.llamacppUrl,
  );
  const setPersistedUrl = useSettingsStore((state) =>
    runtime.key === 'lmstudio' ? state.setLmStudioUrl : state.setLlamaCppUrl,
  );

  const [urlInput, setUrlInput] = React.useState(persistedUrl || runtime.defaultUrl);
  const [checking, setChecking] = React.useState(true);
  const [available, setAvailable] = React.useState(false);
  const [models, setModels] = React.useState<RemoteModel[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setUrlInput(persistedUrl || runtime.defaultUrl);
  }, [persistedUrl, runtime.defaultUrl]);

  const refresh = React.useCallback(async () => {
    setChecking(true);
    try {
      const status = await invoke<ProviderStatusResponse>('llm_check_provider_status', {
        provider: runtime.key,
      });
      setAvailable(Boolean(status.available));
      setError(status.available ? null : (status.error ?? null));
      if (status.available) {
        const rawModels = await invoke<unknown>(runtime.listCommand).catch(() => []);
        setModels(Array.isArray(rawModels) ? (rawModels as RemoteModel[]) : []);
      } else {
        setModels([]);
      }
    } catch (err) {
      setAvailable(false);
      setModels([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  }, [runtime.key, runtime.listCommand]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const commitUrl = (raw: string) => {
    if (!raw.trim()) {
      setPersistedUrl(raw);
      return;
    }
    try {
      new URL(raw);
      const result = validateUrl(raw, { allowLocalhost: true });
      if (!result.valid) {
        toast.error(result.error ?? `Invalid ${runtime.label} URL`);
        return;
      }
      const sanitized = result.sanitized ?? raw;
      setPersistedUrl(sanitized);
      invoke('llm_configure_provider', {
        provider: runtime.key,
        apiKey: null,
        baseUrl: sanitized,
      })
        .then(() => void refresh())
        .catch((err: unknown) => {
          console.error(`Failed to configure ${runtime.label} provider:`, err);
        });
    } catch {
      toast.error(`Invalid ${runtime.label} URL`);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="rounded-md bg-muted p-3">
            <Server className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold mb-2">{runtime.label} (Local Runtime)</h4>
            <p className="text-sm text-muted-foreground mb-3">
              OpenAI-compatible local server. Models run entirely on your machine — nothing leaves
              this device.
            </p>

            <div className="flex flex-col gap-1.5 mb-3">
              <label className="text-xs font-medium text-muted-foreground">
                {runtime.label} URL
              </label>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onBlur={(e) => commitUrl(e.target.value)}
                placeholder={runtime.defaultUrl}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">Default: {runtime.defaultUrl}</p>
            </div>

            {checking ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Checking {runtime.label} status...</span>
              </div>
            ) : available ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-green-600">
                  <Check className="h-3 w-3" />
                  <span>{runtime.label} is running and available</span>
                </div>
                {models.length > 0 ? (
                  <p className="text-xs text-muted-foreground break-words">
                    Loaded: {models.map((m) => m.name || m.id).join(', ')}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Server running, but no model is currently loaded.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-yellow-600">
                {runtime.label} not detected{error ? ` — ${error}` : ''}. Learn more at{' '}
                <a
                  href={runtime.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {runtime.docsHost}
                </a>
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={checking}
          title={`Re-check ${runtime.label} status`}
          className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={checking ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
        </button>
      </div>
    </div>
  );
}

export function LocalRuntimeSettings() {
  return (
    <div className="space-y-4">
      {RUNTIMES.map((runtime) => (
        <LocalRuntimeCard key={runtime.key} runtime={runtime} />
      ))}
    </div>
  );
}

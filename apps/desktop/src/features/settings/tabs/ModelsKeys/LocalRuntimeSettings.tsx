import React from 'react';
import { Check, Loader2, RefreshCw, Server } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmAction } from '@agiworkforce/ui';
import { McpClient } from '@/api/mcp';
import { deleteApiKey, listSavedApiKeys } from '@/api/byok';
import { validateUrl } from '@/utils/security';
import { invoke } from '@/lib/tauri-mock';
import { notifyLocalModelCatalogChanged } from '@/lib/localModelCatalog';
import { useSettingsStore } from '@/stores/settingsStore';
import { LmStudioMemory } from './LocalModelMemory';

interface RemoteModel {
  id: string;
  name: string;
}

interface ProviderStatusResponse {
  available: boolean;
  configured: boolean;
  error?: string | null;
  saved_key_awaits_confirmation?: string | null;
}

type RuntimeKey = 'lmstudio' | 'llamacpp' | 'vllm';

interface RuntimeConfig {
  key: RuntimeKey;
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
  {
    key: 'vllm',
    label: 'vLLM',
    defaultUrl: 'http://localhost:8000/v1',
    docsHost: 'docs.vllm.ai',
    docsUrl: 'https://docs.vllm.ai',
    listCommand: 'llm_list_vllm_models',
  },
];

function selectPersistedUrl(state: ReturnType<typeof useSettingsStore.getState>, key: RuntimeKey) {
  switch (key) {
    case 'lmstudio':
      return state.llmConfig.lmstudioUrl;
    case 'llamacpp':
      return state.llmConfig.llamacppUrl;
    case 'vllm':
      return state.llmConfig.vllmUrl;
  }
}

function selectSetPersistedUrl(
  state: ReturnType<typeof useSettingsStore.getState>,
  key: RuntimeKey,
) {
  switch (key) {
    case 'lmstudio':
      return state.setLmStudioUrl;
    case 'llamacpp':
      return state.setLlamaCppUrl;
    case 'vllm':
      return state.setVllmUrl;
  }
}

function LocalRuntimeCard({ runtime }: { runtime: RuntimeConfig }) {
  const persistedUrl = useSettingsStore((state) => selectPersistedUrl(state, runtime.key));
  const setPersistedUrl = useSettingsStore((state) => selectSetPersistedUrl(state, runtime.key));

  const [urlInput, setUrlInput] = React.useState(persistedUrl || runtime.defaultUrl);
  const [checking, setChecking] = React.useState(true);
  const [available, setAvailable] = React.useState(false);
  const [models, setModels] = React.useState<RemoteModel[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [awaitingHost, setAwaitingHost] = React.useState<string | null>(null);
  const [reconnecting, setReconnecting] = React.useState(false);
  const allowPrivateNetwork = useSettingsStore(
    (state) => state.llmConfig.allowPrivateNetworkRuntimes === true,
  );
  const [keySaved, setKeySaved] = React.useState(false);
  const [keyInput, setKeyInput] = React.useState('');
  const [savingKey, setSavingKey] = React.useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  React.useEffect(() => {
    setUrlInput(persistedUrl || runtime.defaultUrl);
  }, [persistedUrl, runtime.defaultUrl]);

  React.useEffect(() => {
    let cancelled = false;
    listSavedApiKeys()
      .then((providers) => {
        if (!cancelled) setKeySaved(providers.includes(runtime.key));
      })
      .catch(() => {
        if (!cancelled) setKeySaved(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runtime.key]);

  const refresh = React.useCallback(
    async (notifyCatalog = false) => {
      setChecking(true);
      try {
        const status = await invoke<ProviderStatusResponse>('llm_check_provider_status', {
          provider: runtime.key,
        });
        setAvailable(Boolean(status.available));
        setError(status.available ? null : (status.error ?? null));
        setAwaitingHost(status.saved_key_awaits_confirmation ?? null);
        if (status.available) {
          const rawModels = await invoke<unknown>(runtime.listCommand).catch(() => []);
          setModels(Array.isArray(rawModels) ? (rawModels as RemoteModel[]) : []);
        } else {
          setModels([]);
        }
      } catch (err) {
        setAvailable(false);
        setModels([]);
        setAwaitingHost(null);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setChecking(false);
        if (notifyCatalog) notifyLocalModelCatalogChanged('runtime-refresh');
      }
    },
    [runtime.key, runtime.listCommand],
  );

  React.useEffect(() => {
    void refresh(false);
  }, [refresh]);

  const reregister = React.useCallback(async () => {
    try {
      await invoke('llm_configure_provider', {
        provider: runtime.key,
        apiKey: null,
        baseUrl: persistedUrl || runtime.defaultUrl,
        allowPrivateNetwork,
        userInitiated: true,
      });
    } finally {
      await refresh(true);
    }
  }, [allowPrivateNetwork, persistedUrl, refresh, runtime.defaultUrl, runtime.key]);

  const reconnect = async () => {
    setReconnecting(true);
    try {
      await reregister();
    } catch (err) {
      toast.error(
        `${runtime.label} was not connected: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setReconnecting(false);
    }
  };

  const saveKey = async () => {
    const key = keyInput.trim();
    if (!key) return;
    setSavingKey(true);
    try {
      await McpClient.saveApiKey(runtime.key, key);
      setKeyInput('');
      setKeySaved(true);
    } catch (err) {
      toast.error(
        `Could not save the ${runtime.label} key: ${err instanceof Error ? err.message : String(err)}`,
      );
      setSavingKey(false);
      return;
    }
    try {
      await reregister();
    } catch (err) {
      toast.error(
        `The ${runtime.label} key was saved, but ${runtime.label} was not connected with it: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setSavingKey(false);
    }
  };

  const requestRemoveKey = () => {
    confirm({
      title: `Remove the ${runtime.label} server key?`,
      description: `The key is deleted from this device. If your ${runtime.label} server was started with an API key, AGI Workforce can no longer use it until you save the key again.`,
      confirmLabel: 'Remove key',
      onConfirm: async () => {
        try {
          await deleteApiKey(runtime.key);
          setKeySaved(false);
        } catch (err) {
          toast.error(
            `Could not remove the ${runtime.label} key: ${err instanceof Error ? err.message : String(err)}`,
          );
          return;
        }
        try {
          await reregister();
        } catch (err) {
          toast.error(
            `The ${runtime.label} key was removed, but ${runtime.label} was not connected again: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
    });
  };

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
              OpenAI-compatible server on this computer, or on a computer you own on your private
              network when that setting is on. Requests never go to the public internet.
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
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-e1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Default: {runtime.defaultUrl}. Changes apply when you save Settings.
              </p>
            </div>

            <div className="flex flex-col gap-1.5 mb-3">
              <label
                htmlFor={`${runtime.key}-server-key`}
                className="text-xs font-medium text-muted-foreground"
              >
                Server API key (only if your server requires one)
              </label>
              {keySaved ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>A key is saved for {runtime.label}.</span>
                  <button
                    type="button"
                    onClick={requestRemoveKey}
                    className="rounded-md border border-border px-2 py-1 text-foreground hover:bg-accent"
                  >
                    Remove key
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    id={`${runtime.key}-server-key`}
                    type="password"
                    autoComplete="off"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => void saveKey()}
                    disabled={savingKey || !keyInput.trim()}
                    className="shrink-0 rounded-md border border-border px-3 text-sm hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Save key
                  </button>
                </div>
              )}
            </div>

            {checking ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Checking {runtime.label} status...</span>
              </div>
            ) : available ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-success-text">
                  <Check className="h-3 w-3" />
                  <span>{runtime.label} is running and available</span>
                </div>
                {models.length > 0 ? (
                  <p className="text-xs text-muted-foreground break-words">
                    Available: {models.map((m) => m.name || m.id).join(', ')}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Server running, but it reports no model.
                  </p>
                )}
                {runtime.key === 'lmstudio' ? (
                  <LmStudioMemory
                    onChanged={() => notifyLocalModelCatalogChanged('runtime-refresh')}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Loading and unloading models from here is not offered for {runtime.label}.
                    Manage them on the server.
                  </p>
                )}
              </div>
            ) : awaitingHost ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                <span className="min-w-0 flex-1">
                  {runtime.label} is not connected. Reconnect to confirm sending your saved key to{' '}
                  {awaitingHost}.
                </span>
                <button
                  type="button"
                  onClick={() => void reconnect()}
                  disabled={reconnecting}
                  className="shrink-0 rounded-md border border-border px-2 py-1 text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Reconnect
                </button>
              </div>
            ) : (
              <p className="text-xs text-warning-text">
                {runtime.label} not detected{error ? `, ${error}` : ''}. Learn more at{' '}
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
          onClick={() => void refresh(true)}
          disabled={checking}
          aria-label={`Re-check ${runtime.label} status`}
          title={`Re-check ${runtime.label} status`}
          className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={checking ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
        </button>
      </div>
      {confirmDialog}
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

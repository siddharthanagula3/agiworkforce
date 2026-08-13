import React, { Suspense, lazy } from 'react';
import { Check, Download, Loader2, Server } from 'lucide-react';
import type { Provider } from '@agiworkforce/types';
import { validateUrl } from '@/utils/security';
import { invoke } from '@/lib/tauri-mock';
import { McpClient } from '@/api/mcp';
import { Button } from '@/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/Select';
import { Switch } from '@/ui/Switch';

const LazyCustomModelsSettings = lazy(() =>
  import('../../CustomModelsSettings').then((m) => ({ default: m.CustomModelsSettings })),
);

const LazyLocalRuntimeSettings = lazy(() =>
  import('./LocalRuntimeSettings').then((m) => ({ default: m.LocalRuntimeSettings })),
);

function Fallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

const BYOK_PROVIDERS: ReadonlyArray<{ id: Provider; name: string; placeholder: string }> = [
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'google', name: 'Google (Gemini)', placeholder: 'AIza...' },
  { id: 'xai', name: 'xAI (Grok)', placeholder: 'xai-...' },
  { id: 'deepseek', name: 'DeepSeek', placeholder: 'sk-...' },
  { id: 'perplexity', name: 'Perplexity', placeholder: 'pplx-...' },
  { id: 'open_router', name: 'OpenRouter', placeholder: 'sk-or-...' },
  { id: 'nvidia_nim', name: 'NVIDIA NIM', placeholder: 'nvapi-...' },
  { id: 'qwen', name: 'Qwen (Alibaba)', placeholder: 'API key...' },
  { id: 'moonshot', name: 'Moonshot (Kimi)', placeholder: 'API key...' },
  { id: 'zhipu', name: 'Zhipu (GLM)', placeholder: 'API key...' },
] as const;

type ProviderHealth = {
  provider: Provider;
  available: boolean;
  configured: boolean;
  error?: string;
};

function BYOKApiKeysSection() {
  const [keys, setKeys] = React.useState<Record<string, string>>({});
  const [statuses, setStatuses] = React.useState<
    Record<string, 'idle' | 'saving' | 'saved' | 'testing' | 'error'>
  >({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [savedProviders, setSavedProviders] = React.useState<Record<string, boolean>>({});
  const [health, setHealth] = React.useState<Partial<Record<Provider, ProviderHealth>>>({});
  const savedTimersRef = React.useRef<Record<string, number>>({});

  React.useEffect(() => {
    const timers = savedTimersRef.current;
    return () => {
      for (const timerId of Object.values(timers)) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  const checkProvider = React.useCallback(async (providerId: Provider) => {
    const result = await invoke<ProviderHealth>('llm_check_provider_status', {
      provider: providerId,
    });
    setHealth((h) => ({ ...h, [providerId]: result }));
    return result;
  }, []);

  const handleTest = React.useCallback(
    async (providerId: Provider) => {
      setStatuses((s) => ({ ...s, [providerId]: 'testing' }));
      setErrors((e) => ({ ...e, [providerId]: '' }));
      try {
        const result = await checkProvider(providerId);
        setStatuses((s) => ({ ...s, [providerId]: result.available ? 'saved' : 'idle' }));
        if (!result.available) {
          setErrors((e) => ({
            ...e,
            [providerId]:
              result.error ||
              'Provider is saved locally but did not verify as available. Check the key, model access, and network.',
          }));
        }
      } catch (err) {
        setStatuses((s) => ({ ...s, [providerId]: 'error' }));
        setErrors((e) => ({ ...e, [providerId]: String(err) }));
      }
    },
    [checkProvider],
  );

  const handleSave = React.useCallback(
    async (providerId: Provider) => {
      const key = keys[providerId]?.trim();
      if (!key) return;
      setStatuses((s) => ({ ...s, [providerId]: 'saving' }));
      setErrors((e) => ({ ...e, [providerId]: '' }));
      try {
        await McpClient.saveApiKey(providerId, key);
        setSavedProviders((s) => ({ ...s, [providerId]: true }));
        setKeys((k) => ({ ...k, [providerId]: '' }));
        const result = await checkProvider(providerId).catch<ProviderHealth | null>(() => null);
        setStatuses((s) => ({ ...s, [providerId]: 'saved' }));
        if (result && !result.available) {
          setErrors((e) => ({
            ...e,
            [providerId]:
              result.error ||
              'Key saved locally. Live availability was not confirmed yet; test again or start a BYOK chat.',
          }));
        }
        if (savedTimersRef.current[providerId]) {
          window.clearTimeout(savedTimersRef.current[providerId]);
        }
        savedTimersRef.current[providerId] = window.setTimeout(() => {
          setStatuses((s) => ({ ...s, [providerId]: 'idle' }));
          delete savedTimersRef.current[providerId];
        }, 2500);
      } catch (err) {
        setStatuses((s) => ({ ...s, [providerId]: 'error' }));
        setErrors((e) => ({ ...e, [providerId]: String(err) }));
      }
    },
    [checkProvider, keys],
  );

  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">API Keys (BYOK)</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Enter your own API keys for each AI provider. Keys are encrypted and stored locally.
      </p>
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {BYOK_PROVIDERS.map(({ id, name, placeholder }) => {
          const status = statuses[id] ?? 'idle';
          const providerHealth = health[id];
          const isBusy = status === 'saving' || status === 'testing';
          return (
            <div key={id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-sm font-medium">{name}</span>
                <input
                  type="password"
                  value={keys[id] ?? ''}
                  onChange={(e) => setKeys((k) => ({ ...k, [id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSave(id);
                  }}
                  placeholder={placeholder}
                  className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <button
                  type="button"
                  disabled={!keys[id]?.trim() || isBusy}
                  onClick={() => void handleSave(id)}
                  className="shrink-0 h-8 w-16 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {status === 'saving' ? (
                    <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
                  ) : status === 'saved' ? (
                    <Check className="mx-auto h-3.5 w-3.5" />
                  ) : (
                    'Save'
                  )}
                </button>
                <button
                  type="button"
                  disabled={isBusy || !savedProviders[id]}
                  onClick={() => void handleTest(id)}
                  className="shrink-0 h-8 w-14 rounded-md border border-border text-xs font-medium hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {status === 'testing' ? (
                    <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" />
                  ) : (
                    'Test'
                  )}
                </button>
              </div>
              {(providerHealth || errors[id]) && (
                <p
                  className={`mt-1.5 text-xs ${
                    providerHealth?.available ? 'text-green-600' : 'text-muted-foreground'
                  }`}
                  style={{ marginLeft: 156 }}
                >
                  {providerHealth?.available
                    ? 'Verified and ready.'
                    : providerHealth?.configured
                      ? 'Saved locally. Live availability is not confirmed yet.'
                      : errors[id] || 'Not configured.'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface ModelsKeysTabProps {
  resolvedLLMConfig: {
    ollamaUrl?: string;
    defaultModels?: Record<string, string>;
  };
  ollamaModels: string[];
  selectedOllamaModel: string;
  checkingOllama: boolean;
  isOllamaAvailable: boolean;
  ollamaEnabled: boolean;
  installingOllamaModel: boolean;
  ollamaInstallError: string | null;
  onOllamaUrlChange: (url: string) => void;
  onOllamaEnabledChange: (enabled: boolean) => void;
  onOllamaModelChange: (model: string) => void;
  onRefreshOllamaState: () => Promise<void>;
  onInstallOllamaModel: (modelName: string) => Promise<void>;
  onExportSettings: () => void;
}

export function ModelsKeysTab({
  resolvedLLMConfig,
  ollamaModels,
  selectedOllamaModel,
  checkingOllama,
  isOllamaAvailable,
  ollamaEnabled,
  installingOllamaModel,
  ollamaInstallError,
  onOllamaUrlChange,
  onOllamaEnabledChange,
  onOllamaModelChange,
  onRefreshOllamaState,
  onInstallOllamaModel,
  onExportSettings,
}: ModelsKeysTabProps) {
  const [modelToInstall, setModelToInstall] = React.useState('');
  const persistedOllamaUrl = resolvedLLMConfig.ollamaUrl ?? 'http://localhost:11434';
  const [ollamaUrlInput, setOllamaUrlInput] = React.useState(persistedOllamaUrl);
  const [ollamaUrlError, setOllamaUrlError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setOllamaUrlInput(persistedOllamaUrl);
    setOllamaUrlError(null);
  }, [persistedOllamaUrl]);

  const commitOllamaUrl = React.useCallback(() => {
    const raw = ollamaUrlInput.trim();
    if (!raw) {
      const defaultUrl = 'http://localhost:11434';
      setOllamaUrlInput(defaultUrl);
      setOllamaUrlError(null);
      onOllamaUrlChange(defaultUrl);
      return;
    }

    const result = validateUrl(raw, { allowLocalhost: true });
    if (!result.valid) {
      setOllamaUrlError(result.error ?? 'Enter a valid HTTP or HTTPS URL');
      return;
    }

    const sanitized = result.sanitized ?? raw;
    setOllamaUrlInput(sanitized);
    setOllamaUrlError(null);
    onOllamaUrlChange(sanitized);
  }, [ollamaUrlInput, onOllamaUrlChange]);

  const installModel = React.useCallback(() => {
    const modelName = modelToInstall.trim();
    if (!modelName || installingOllamaModel) return;
    void onInstallOllamaModel(modelName)
      .then(() => setModelToInstall(''))
      .catch(() => {
        // The parent exposes the actionable error inline and as a toast.
      });
  }, [installingOllamaModel, modelToInstall, onInstallOllamaModel]);

  return (
    <>
      <BYOKApiKeysSection />

      <div className="pt-6 border-t border-border">
        <h3 className="text-lg font-semibold mb-4">Local Models</h3>
        <div className="space-y-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="ollama-base-url" className="text-sm font-medium">
              Ollama URL
            </label>
            <input
              id="ollama-base-url"
              aria-label="Ollama URL"
              type="url"
              value={ollamaUrlInput}
              onChange={(e) => {
                setOllamaUrlInput(e.target.value);
                if (ollamaUrlError) setOllamaUrlError(null);
              }}
              onBlur={commitOllamaUrl}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              aria-invalid={ollamaUrlError ? 'true' : undefined}
              aria-describedby={ollamaUrlError ? 'ollama-base-url-error' : undefined}
              placeholder="http://localhost:11434"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {ollamaUrlError ? (
              <p id="ollama-base-url-error" role="alert" className="text-xs text-destructive">
                {ollamaUrlError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                URL for the local Ollama server. Default: http://localhost:11434
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="rounded-md bg-muted p-3">
                  <Server className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-2">Local Ollama (Offline Mode)</h4>
                  <p className="text-sm text-muted-foreground mb-3">
                    Use Ollama for offline AI processing. Models run locally on your machine for
                    complete privacy and no internet required.
                  </p>
                  {checkingOllama ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Checking Ollama status...</span>
                    </div>
                  ) : isOllamaAvailable ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs text-green-600">
                        <Check className="h-3 w-3" />
                        <span>Ollama is running and available</span>
                      </div>
                      {ollamaModels.length > 0 && (
                        <div className="space-y-1.5">
                          <Select value={selectedOllamaModel} onValueChange={onOllamaModelChange}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select model" />
                            </SelectTrigger>
                            <SelectContent>
                              {ollamaModels.map((model) => (
                                <SelectItem key={model} value={model}>
                                  {model}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!ollamaEnabled && (
                            <p className="text-xs text-muted-foreground">
                              Detected locally. Turn on Local Ollama to use this as the default
                              local model.
                            </p>
                          )}
                        </div>
                      )}
                      <div className="space-y-2 rounded-md border border-border/70 bg-background/70 p-3">
                        <div>
                          <label
                            htmlFor="ollama-model-install"
                            className="text-xs font-medium text-foreground"
                          >
                            Add a local model
                          </label>
                          <p
                            id="ollama-model-install-help"
                            className="mt-0.5 text-xs text-muted-foreground"
                          >
                            Enter an Ollama model name. Downloads can take several minutes and stay
                            on this device.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <input
                            id="ollama-model-install"
                            aria-label="Model to install"
                            aria-describedby="ollama-model-install-help"
                            value={modelToInstall}
                            onChange={(event) => setModelToInstall(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                installModel();
                              }
                            }}
                            placeholder="e.g. model-name:tag"
                            disabled={installingOllamaModel}
                            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={installModel}
                            disabled={!modelToInstall.trim() || installingOllamaModel}
                            aria-busy={installingOllamaModel}
                            aria-label={
                              installingOllamaModel ? 'Installing local model' : 'Install model'
                            }
                          >
                            {installingOllamaModel ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Downloading…
                              </>
                            ) : (
                              <>
                                <Download className="mr-2 h-4 w-4" />
                                Install model
                              </>
                            )}
                          </Button>
                        </div>
                        {ollamaInstallError && (
                          <p role="alert" className="text-xs text-destructive">
                            {ollamaInstallError}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-yellow-600">
                      <span>
                        Ollama not detected. Correct the URL above, or install from{' '}
                        <a
                          href="https://ollama.ai"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          ollama.ai
                        </a>
                        .
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void onRefreshOllamaState()}
                        disabled={checkingOllama}
                        aria-label="Re-check Ollama status"
                      >
                        {checkingOllama ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Re-check
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <Switch checked={ollamaEnabled} onCheckedChange={onOllamaEnabledChange} />
            </div>
          </div>

          <Suspense fallback={<Fallback label="Loading local runtime settings..." />}>
            <LazyLocalRuntimeSettings />
          </Suspense>

          <Suspense fallback={<Fallback label="Loading custom model settings..." />}>
            <LazyCustomModelsSettings />
          </Suspense>
        </div>
      </div>

      <div className="pt-6 border-t border-border">
        <h3 className="text-lg font-semibold mb-4">Settings Management</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Export or import your settings configuration
        </p>
        <Button variant="outline" size="sm" onClick={onExportSettings}>
          <Download className="mr-2 h-4 w-4" />
          Export Settings
        </Button>
      </div>

      <div className="pt-4 text-xs text-muted-foreground">
        <h4 className="font-medium mb-2">Supported Providers</h4>
        <ul className="list-disc list-inside space-y-1">
          {BYOK_PROVIDERS.map(({ id, name }) => (
            <li key={id}>{name}</li>
          ))}
          <li>Ollama (any local model)</li>
        </ul>
      </div>
    </>
  );
}

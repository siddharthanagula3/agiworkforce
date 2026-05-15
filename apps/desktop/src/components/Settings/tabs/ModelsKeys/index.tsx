import React, { Suspense, lazy } from 'react';
import { Check, Loader2, Download, Server } from 'lucide-react';
import { toast } from 'sonner';
import { validateUrl } from '@/utils/security';
import { McpClient } from '@/api/mcp';
import { Button } from '../../../ui/Button';
import { Label } from '../../../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../ui/Select';
import { Switch } from '../../../ui/Switch';
import { FavoriteModelsSelector } from '../../FavoriteModelsSelector';

const LazyCustomModelsSettings = lazy(() =>
  import('../../CustomModelsSettings').then((m) => ({ default: m.CustomModelsSettings })),
);
const LazyTaskRoutingSettings = lazy(() =>
  import('../../TaskRoutingSettings').then((m) => ({ default: m.TaskRoutingSettings })),
);

function Fallback({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

const BYOK_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'google', name: 'Google (Gemini)', placeholder: 'AIza...' },
  { id: 'xai', name: 'xAI (Grok)', placeholder: 'xai-...' },
  { id: 'deepseek', name: 'DeepSeek', placeholder: 'sk-...' },
  { id: 'mistral', name: 'Mistral', placeholder: 'API key...' },
  { id: 'perplexity', name: 'Perplexity', placeholder: 'pplx-...' },
  { id: 'openrouter', name: 'OpenRouter', placeholder: 'sk-or-...' },
  { id: 'nvidia_nim', name: 'NVIDIA NIM', placeholder: 'nvapi-...' },
] as const;

function BYOKApiKeysSection() {
  const [keys, setKeys] = React.useState<Record<string, string>>({});
  const [statuses, setStatuses] = React.useState<
    Record<string, 'idle' | 'saving' | 'saved' | 'error'>
  >({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const savedTimersRef = React.useRef<Record<string, number>>({});

  React.useEffect(() => {
    const timers = savedTimersRef.current;
    return () => {
      for (const timerId of Object.values(timers)) {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  const handleSave = React.useCallback(
    async (providerId: string) => {
      const key = keys[providerId]?.trim();
      if (!key) return;
      setStatuses((s) => ({ ...s, [providerId]: 'saving' }));
      setErrors((e) => ({ ...e, [providerId]: '' }));
      try {
        await McpClient.saveApiKey(providerId, key);
        setStatuses((s) => ({ ...s, [providerId]: 'saved' }));
        setKeys((k) => ({ ...k, [providerId]: '' }));
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
    [keys],
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
          return (
            <div key={id} className="flex items-center gap-3 px-4 py-3">
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
                disabled={!keys[id]?.trim() || status === 'saving'}
                onClick={() => void handleSave(id)}
                className="shrink-0 h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {status === 'saving' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : status === 'saved' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  'Save'
                )}
              </button>
              {errors[id] && <p className="text-xs text-destructive mt-1">{errors[id]}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface ModelsKeysTabProps {
  resolvedLLMConfig: {
    providerMode?: 'auto' | 'local' | 'cloud';
    ollamaUrl?: string;
    defaultModels?: Record<string, string>;
  };
  chatPreferences: {
    alwaysUseAgentMode?: boolean;
    autoApproveTools?: boolean;
    compactMode?: boolean;
    promptCompletionEnabled?: boolean;
  } | null;
  ollamaModels: string[];
  selectedOllamaModel: string;
  checkingOllama: boolean;
  isOllamaAvailable: boolean;
  ollamaEnabled: boolean;
  onProviderModeChange: (mode: 'auto' | 'local' | 'cloud') => void;
  onOllamaUrlChange: (url: string) => void;
  onOllamaEnabledChange: (enabled: boolean) => void;
  onOllamaModelChange: (model: string) => void;
  onAgentModeChange: (value: boolean) => void;
  onAutoApproveToolsChange: (value: boolean) => void;
  onCompactModeChange: (value: boolean) => void;
  onPromptCompletionChange: (value: boolean) => void;
  onExportSettings: () => void;
}

export function ModelsKeysTab({
  resolvedLLMConfig,
  chatPreferences,
  ollamaModels,
  selectedOllamaModel,
  checkingOllama,
  isOllamaAvailable,
  ollamaEnabled,
  onProviderModeChange,
  onOllamaUrlChange,
  onOllamaEnabledChange,
  onOllamaModelChange,
  onAgentModeChange,
  onAutoApproveToolsChange,
  onCompactModeChange,
  onPromptCompletionChange,
  onExportSettings,
}: ModelsKeysTabProps) {
  return (
    <>
      <BYOKApiKeysSection />

      <div className="pt-6 border-t border-border">
        <h3 className="text-lg font-semibold mb-4">Local Models</h3>
        <div className="space-y-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Provider Mode</label>
            <div className="flex gap-2">
              {(['auto', 'local', 'cloud'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onProviderModeChange(mode)}
                  className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                    (resolvedLLMConfig.providerMode ?? 'auto') === mode
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-accent'
                  }`}
                >
                  {mode === 'auto' ? '⚡ Auto' : mode === 'local' ? '🖥️ Local' : '☁️ Cloud'}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {(resolvedLLMConfig.providerMode ?? 'auto') === 'local'
                ? 'Always use local Ollama. No data leaves your machine.'
                : (resolvedLLMConfig.providerMode ?? 'auto') === 'cloud'
                  ? 'Always use cloud providers (OpenAI, Anthropic, etc.).'
                  : 'Automatically route to the best provider for each task.'}
            </p>
          </div>

          {(resolvedLLMConfig.providerMode ?? 'auto') !== 'cloud' && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Ollama URL</label>
              <input
                type="url"
                value={resolvedLLMConfig.ollamaUrl ?? 'http://localhost:11434'}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (!raw.trim()) {
                    onOllamaUrlChange(raw);
                    return;
                  }
                  try {
                    new URL(raw);
                    const result = validateUrl(raw, { allowLocalhost: true });
                    if (!result.valid) {
                      toast.error(result.error ?? 'Invalid Ollama URL');
                      return;
                    }
                    onOllamaUrlChange(result.sanitized ?? raw);
                  } catch {
                    onOllamaUrlChange(raw);
                  }
                }}
                placeholder="http://localhost:11434"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                URL for the local Ollama server. Default: http://localhost:11434
              </p>
            </div>
          )}

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
                      {ollamaEnabled && ollamaModels.length > 0 && (
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
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-yellow-600">
                      Ollama not detected. Install from{' '}
                      <a
                        href="https://ollama.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        ollama.ai
                      </a>
                    </p>
                  )}
                </div>
              </div>
              <Switch checked={ollamaEnabled} onCheckedChange={onOllamaEnabledChange} />
            </div>
          </div>

          <FavoriteModelsSelector />
          <Suspense fallback={<Fallback label="Loading custom model settings..." />}>
            <LazyCustomModelsSettings />
          </Suspense>
        </div>
      </div>

      <div className="pt-6 border-t border-border">
        <h3 className="text-lg font-semibold mb-4">Task Routing</h3>
        <Suspense fallback={<Fallback label="Loading task routing settings..." />}>
          <LazyTaskRoutingSettings />
        </Suspense>
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

      <div className="pt-6 border-t border-border">
        <h3 className="text-lg font-semibold mb-4">Model Behavior</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="agentMode">Always Use Agent Mode</Label>
              <p className="text-xs text-muted-foreground">
                Agent mode enables tool use, web browsing, and code execution
              </p>
            </div>
            <Switch
              id="agentMode"
              checked={chatPreferences?.alwaysUseAgentMode ?? false}
              onCheckedChange={onAgentModeChange}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="autoApprove">Auto-Approve Tools</Label>
              <p className="text-xs text-muted-foreground">
                Automatically approve safe tool executions without confirmation
              </p>
            </div>
            <Switch
              id="autoApprove"
              checked={chatPreferences?.autoApproveTools ?? false}
              onCheckedChange={onAutoApproveToolsChange}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="compactMode">Compact Mode</Label>
              <p className="text-xs text-muted-foreground">
                Reduce spacing between messages for a denser view
              </p>
            </div>
            <Switch
              id="compactMode"
              checked={chatPreferences?.compactMode ?? false}
              onCheckedChange={onCompactModeChange}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="promptCompletion">Prompt Completion</Label>
              <p className="text-xs text-muted-foreground">
                Show AI-powered suggestions as you type
              </p>
            </div>
            <Switch
              id="promptCompletion"
              checked={chatPreferences?.promptCompletionEnabled ?? true}
              onCheckedChange={onPromptCompletionChange}
            />
          </div>
        </div>
      </div>

      <div className="pt-4 text-xs text-muted-foreground">
        <h4 className="font-medium mb-2">Supported Providers</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>OpenAI (GPT-5.4, GPT-5.4 Mini, o3)</li>
          <li>Anthropic (Claude Opus 4.6, Sonnet 4.6, Haiku 4.5)</li>
          <li>Google (Gemini 3.1 Flash Lite, Gemini 3.1 Pro)</li>
          <li>xAI (Grok 4, Grok 4.1 Fast)</li>
          <li>DeepSeek (R1, V3.2)</li>
          <li>Mistral (Large, Codestral)</li>
          <li>Qwen (Qwen3.5 Plus, Qwen3.5 Flash)</li>
          <li>Kimi (K2.5, K2.5 Thinking)</li>
          <li>Perplexity (Sonar Pro, Sonar Reasoning)</li>
          <li>NVIDIA NIM (Nemotron Ultra, Super, Nano — free tier)</li>
          <li>OpenRouter (200+ models, generous free tier)</li>
          <li>Ollama (any local model)</li>
        </ul>
      </div>
    </>
  );
}

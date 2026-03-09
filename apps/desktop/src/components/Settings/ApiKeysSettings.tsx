/**
 * ApiKeysSettings tab content
 *
 * Extracted from SettingsPanel.tsx for code organization.
 * Handles: BYOK API keys, Local Models (Ollama), Model Behavior toggles,
 * Settings export, and Effort Level selector.
 */
import React, { useCallback } from 'react';
import { Check, Download, Loader2, Server } from 'lucide-react';
import { invoke } from '@/lib/tauri-mock';
import { Button } from '../ui/Button';
import { Label } from '../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { FavoriteModelsSelector } from './FavoriteModelsSelector';
import { CustomModelsSettings } from './CustomModelsSettings';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useSettingsStore } from '../../stores/settingsStore';
import type { EffortLevel } from '../../stores/llmConfigStore';

// =============================================================================
// BYOK providers list
// =============================================================================

const BYOK_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'google', name: 'Google (Gemini)', placeholder: 'AIza...' },
  { id: 'xai', name: 'xAI (Grok)', placeholder: 'xai-...' },
  { id: 'deepseek', name: 'DeepSeek', placeholder: 'sk-...' },
  { id: 'mistral', name: 'Mistral', placeholder: 'API key...' },
  { id: 'perplexity', name: 'Perplexity', placeholder: 'pplx-...' },
  { id: 'openrouter', name: 'OpenRouter', placeholder: 'sk-or-...' },
] as const;

function BYOKApiKeysSection() {
  const [keys, setKeys] = React.useState<Record<string, string>>({});
  const [statuses, setStatuses] = React.useState<
    Record<string, 'idle' | 'saving' | 'saved' | 'error'>
  >({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const handleSave = useCallback(
    async (providerId: string) => {
      const key = keys[providerId]?.trim();
      if (!key) return;
      setStatuses((s) => ({ ...s, [providerId]: 'saving' }));
      setErrors((e) => ({ ...e, [providerId]: '' }));
      try {
        await invoke('save_api_key', { provider: providerId, key });
        setStatuses((s) => ({ ...s, [providerId]: 'saved' }));
        setKeys((k) => ({ ...k, [providerId]: '' }));
        setTimeout(() => setStatuses((s) => ({ ...s, [providerId]: 'idle' })), 2500);
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
              {errors[id] && <p className="absolute text-xs text-destructive mt-1">{errors[id]}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Main component
// =============================================================================

interface ApiKeysSettingsProps {
  checkingOllama: boolean;
  isOllamaAvailable: boolean;
  ollamaEnabled: boolean;
  ollamaModels: string[];
  selectedOllamaModel: string;
  chatPreferences:
    | {
        alwaysUseAgentMode?: boolean;
        autoApproveTools?: boolean;
        compactMode?: boolean;
        promptCompletionEnabled?: boolean;
      }
    | null
    | undefined;
  effortLevel: EffortLevel;
  onOllamaEnabledChange: (enabled: boolean) => void;
  onOllamaModelChange: (model: string) => void;
  onAgentModeChange: (value: boolean) => void;
  onAutoApproveToolsChange: (value: boolean) => void;
  onCompactModeChange: (value: boolean) => void;
  onPromptCompletionChange: (value: boolean) => void;
  onEffortLevelChange: (level: EffortLevel) => void;
}

export function ApiKeysSettings({
  checkingOllama,
  isOllamaAvailable,
  ollamaEnabled,
  ollamaModels,
  selectedOllamaModel,
  chatPreferences,
  effortLevel,
  onOllamaEnabledChange,
  onOllamaModelChange,
  onAgentModeChange,
  onAutoApproveToolsChange,
  onCompactModeChange,
  onPromptCompletionChange,
  onEffortLevelChange,
}: ApiKeysSettingsProps) {
  return (
    <>
      <BYOKApiKeysSection />

      <div className="pt-6 border-t border-border">
        <h3 className="text-lg font-semibold mb-4">Local Models</h3>
        <div className="space-y-6">
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
          <CustomModelsSettings />
        </div>
      </div>

      <div className="pt-6 border-t border-border">
        <h3 className="text-lg font-semibold mb-4">Settings Management</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Export or import your settings configuration
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              const settings = useSettingsStore.getState();
              const exportData = JSON.stringify(
                {
                  llmConfig: settings.llmConfig,
                  windowPreferences: settings.windowPreferences,
                  chatPreferences: settings.chatPreferences,
                  executionPreferences: settings.executionPreferences,
                  globalHotkeyPreferences: settings.globalHotkeyPreferences,
                  customModels: settings.customModels,
                },
                null,
                2,
              );
              const savePath = await save({
                defaultPath: `agi-workforce-settings-${new Date().toISOString().split('T')[0]}.json`,
                filters: [{ name: 'JSON', extensions: ['json'] }],
              });
              if (savePath) {
                await writeTextFile(savePath, exportData);
              }
            } catch (error) {
              console.error('Failed to export settings:', error);
            }
          }}
        >
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

          <div className="space-y-2 pt-2">
            <Label htmlFor="effortLevel">Thinking Effort (Claude Opus 4.6+)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Controls reasoning depth for adaptive thinking on Claude Opus 4.6 and later. Higher
              effort increases quality and cost.
            </p>
            <div className="flex gap-2" role="group" aria-label="Thinking effort level">
              {(
                [
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                  { value: 'max', label: 'Max' },
                ] as { value: EffortLevel; label: string }[]
              ).map(({ value, label }) => {
                const isActive = effortLevel === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onEffortLevelChange(value)}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background text-foreground hover:bg-muted'
                    }`}
                    aria-pressed={isActive}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="pt-4 text-xs text-muted-foreground">
        <h4 className="font-medium mb-2">Supported Providers</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>OpenAI (GPT-4o, GPT-4.5, o1, o3-mini)</li>
          <li>Anthropic (Claude 4, Sonnet, Haiku)</li>
          <li>Google (Gemini 2.0 Flash, Pro)</li>
          <li>xAI (Grok-3, Grok-3 Mini)</li>
          <li>DeepSeek (R1, V3)</li>
          <li>Mistral (Large, Codestral)</li>
          <li>Meta Llama (via Ollama)</li>
          <li>Perplexity (Sonar Pro, Sonar)</li>
          <li>OpenRouter (any model)</li>
        </ul>
      </div>
    </>
  );
}

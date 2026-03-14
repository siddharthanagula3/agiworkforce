/**
 * CustomModelsSettings
 *
 * Allows users to configure custom OpenAI-compatible model endpoints
 * (Groq, OpenRouter, Ollama with custom URL, vLLM, LM Studio, etc.)
 */

import {
  AlertCircle,
  Check,
  Edit2,
  Loader2,
  Plus,
  Server,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { CustomModelConfig } from '../../types/customModel';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Switch } from '../ui/Switch';

const PROVIDER_PRESETS: Record<string, string> = {
  Ollama: 'http://localhost:11434/v1',
  'LM Studio': 'http://localhost:1234/v1',
  vLLM: 'http://localhost:8000/v1',
  Groq: 'https://api.groq.com/openai/v1',
  OpenRouter: 'https://openrouter.ai/api/v1',
  'Together AI': 'https://api.together.xyz/v1',
  Fireworks: 'https://api.fireworks.ai/inference/v1',
  Mistral: 'https://api.mistral.ai/v1',
  DeepSeek: 'https://api.deepseek.com/v1',
  Custom: '',
};

const PROVIDER_NAMES = Object.keys(PROVIDER_PRESETS);

interface ModelFormState {
  displayName: string;
  provider: string;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
}

const DEFAULT_FORM: ModelFormState = {
  displayName: '',
  provider: 'Custom',
  baseUrl: '',
  modelId: '',
  apiKey: '',
  contextWindow: 8192,
  supportsStreaming: true,
  supportsTools: true,
  supportsVision: false,
};

interface VerifyResult {
  connected: boolean;
  latencyMs?: number;
  error?: string;
}

async function verifyCustomModel(
  baseUrl: string,
  modelId: string,
  apiKey: string,
): Promise<VerifyResult> {
  try {
    const start = Date.now();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    // Try /models endpoint first
    try {
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        return { connected: true, latencyMs: Date.now() - start };
      }
    } catch {
      // Fall through to chat completions fallback
    }
    // Try chat completions as fallback
    const chatResp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId || 'test',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(8000),
    });
    return chatResp.ok
      ? { connected: true, latencyMs: Date.now() - start }
      : { connected: false, error: chatResp.statusText || `HTTP ${chatResp.status}` };
  } catch (e) {
    return { connected: false, error: e instanceof Error ? e.message : 'Connection failed' };
  }
}

function generateId(provider: string, modelId: string): string {
  const slug = `${provider.toLowerCase().replace(/\s+/g, '-')}/${modelId.toLowerCase().replace(/\s+/g, '-')}`;
  return `${slug}-${Date.now().toString(36)}`;
}

function StatusDot({ status }: { status: CustomModelConfig['status'] }) {
  if (status === 'connected') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <Wifi className="h-3 w-3" />
        Connected
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1 text-xs text-red-500">
        <WifiOff className="h-3 w-3" />
        Error
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/40 inline-block" />
      Unchecked
    </span>
  );
}

function configToFormState(config: CustomModelConfig | null | undefined): ModelFormState {
  if (config) {
    return {
      displayName: config.displayName,
      provider: config.provider,
      baseUrl: config.baseUrl,
      modelId: config.modelId,
      apiKey: '',
      contextWindow: config.contextWindow,
      supportsStreaming: config.supportsStreaming,
      supportsTools: config.supportsTools,
      supportsVision: config.supportsVision,
    };
  }
  return DEFAULT_FORM;
}

interface ModelFormDialogProps {
  open: boolean;
  initial?: CustomModelConfig | null;
  onClose: () => void;
  onSave: (config: CustomModelConfig) => void;
}

function ModelFormDialog({ open, initial, onClose, onSave }: ModelFormDialogProps) {
  const [form, setForm] = useState<ModelFormState>(() => configToFormState(initial));
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<VerifyResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Reset form state when the dialog opens or the edit target changes
  useEffect(() => {
    if (open) {
      setForm(configToFormState(initial));
      setTestResult(null);
      setFormError(null);
    }
  }, [open, initial]);

  const handleProviderChange = (value: string) => {
    const preset = PROVIDER_PRESETS[value] ?? '';
    setForm((prev) => ({ ...prev, provider: value, baseUrl: preset }));
    setTestResult(null);
  };

  const handleFieldChange = (field: keyof ModelFormState, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setTestResult(null);
    setFormError(null);
  };

  const handleTest = useCallback(async () => {
    if (!form.baseUrl.trim()) {
      setFormError('Base URL is required to test the connection.');
      return;
    }
    setTesting(true);
    setTestResult(null);
    const result = await verifyCustomModel(form.baseUrl.trim(), form.modelId.trim(), form.apiKey);
    setTestResult(result);
    setTesting(false);
  }, [form.baseUrl, form.modelId, form.apiKey]);

  const handleSave = () => {
    if (!form.displayName.trim()) {
      setFormError('Display name is required.');
      return;
    }
    if (!form.baseUrl.trim()) {
      setFormError('Base URL is required.');
      return;
    }
    if (!form.modelId.trim()) {
      setFormError('Model ID is required.');
      return;
    }

    const config: CustomModelConfig = {
      id: initial?.id ?? generateId(form.provider, form.modelId),
      displayName: form.displayName.trim(),
      provider: form.provider,
      baseUrl: form.baseUrl.trim(),
      modelId: form.modelId.trim(),
      apiKeyRef: form.apiKey.trim() ? 'stored' : null,
      contextWindow: form.contextWindow,
      supportsStreaming: form.supportsStreaming,
      supportsTools: form.supportsTools,
      supportsVision: form.supportsVision,
      status: testResult?.connected ? 'connected' : (initial?.status ?? 'unchecked'),
      lastVerified: testResult?.connected
        ? new Date().toISOString()
        : (initial?.lastVerified ?? null),
      errorMessage: testResult?.error,
    };
    onSave(config);
  };

  const isEdit = Boolean(initial);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Custom Model' : 'Add Custom Model'}</DialogTitle>
          <DialogDescription>
            Configure an OpenAI-compatible endpoint, verify connectivity, and save the model for
            routing and manual selection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {formError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {formError}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cm-displayName">Display Name</Label>
            <Input
              id="cm-displayName"
              placeholder="e.g. Groq Llama 3.3 70B"
              value={form.displayName}
              onChange={(e) => handleFieldChange('displayName', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cm-provider">Provider Preset</Label>
            <Select value={form.provider} onValueChange={handleProviderChange}>
              <SelectTrigger id="cm-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_NAMES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cm-baseUrl">Base URL</Label>
            <Input
              id="cm-baseUrl"
              placeholder="https://api.example.com/v1"
              value={form.baseUrl}
              onChange={(e) => handleFieldChange('baseUrl', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cm-modelId">Model ID</Label>
            <Input
              id="cm-modelId"
              placeholder="e.g. llama-3.3-70b-versatile"
              value={form.modelId}
              onChange={(e) => handleFieldChange('modelId', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cm-apiKey">
              API Key{' '}
              <span className="text-muted-foreground font-normal">(optional for local models)</span>
            </Label>
            <Input
              id="cm-apiKey"
              type="password"
              placeholder={
                isEdit && initial?.apiKeyRef ? 'Leave blank to keep existing key' : 'sk-...'
              }
              value={form.apiKey}
              onChange={(e) => handleFieldChange('apiKey', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cm-contextWindow">Context Window (tokens)</Label>
            <Input
              id="cm-contextWindow"
              type="number"
              min={1024}
              max={2000000}
              value={form.contextWindow}
              onChange={(e) =>
                handleFieldChange('contextWindow', parseInt(e.target.value, 10) || 8192)
              }
            />
          </div>

          <div className="rounded-lg border border-border bg-[#222222] p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Capabilities
            </p>
            <div className="flex items-center justify-between">
              <Label htmlFor="cm-streaming" className="text-sm font-normal">
                Supports Streaming
              </Label>
              <Switch
                id="cm-streaming"
                checked={form.supportsStreaming}
                onCheckedChange={(v) => handleFieldChange('supportsStreaming', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="cm-tools" className="text-sm font-normal">
                Supports Tool Calls
              </Label>
              <Switch
                id="cm-tools"
                checked={form.supportsTools}
                onCheckedChange={(v) => handleFieldChange('supportsTools', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="cm-vision" className="text-sm font-normal">
                Supports Vision
              </Label>
              <Switch
                id="cm-vision"
                checked={form.supportsVision}
                onCheckedChange={(v) => handleFieldChange('supportsVision', v)}
              />
            </div>
          </div>

          {testResult && (
            <div
              className={`flex items-center gap-2 text-sm rounded-md p-3 ${
                testResult.connected
                  ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400'
              }`}
            >
              {testResult.connected ? (
                <>
                  <Check className="h-4 w-4 shrink-0" />
                  Connected successfully
                  {testResult.latencyMs !== undefined && (
                    <span className="ml-1 text-xs opacity-70">({testResult.latencyMs}ms)</span>
                  )}
                </>
              ) : (
                <>
                  <X className="h-4 w-4 shrink-0" />
                  {testResult.error ?? 'Connection failed'}
                </>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleTest()}
              disabled={testing}
            >
              {testing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>{isEdit ? 'Save Changes' : 'Add Model'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CustomModelsSettings() {
  const customModels = useSettingsStore((state) => state.customModels);
  const addCustomModel = useSettingsStore((state) => state.addCustomModel);
  const updateCustomModel = useSettingsStore((state) => state.updateCustomModel);
  const removeCustomModel = useSettingsStore((state) => state.removeCustomModel);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomModelConfig | null>(null);

  const handleAdd = () => {
    setEditTarget(null);
    setDialogOpen(true);
  };

  const handleEdit = (model: CustomModelConfig) => {
    setEditTarget(model);
    setDialogOpen(true);
  };

  const handleSave = (config: CustomModelConfig) => {
    if (editTarget) {
      updateCustomModel(config.id, config);
    } else {
      addCustomModel(config);
    }
    setDialogOpen(false);
    setEditTarget(null);
  };

  const handleDelete = (id: string) => {
    removeCustomModel(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold">Custom Model Endpoints</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add OpenAI-compatible endpoints: Groq, OpenRouter, vLLM, LM Studio, and more.
          </p>
        </div>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Add Model
        </Button>
      </div>

      {customModels.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Server className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-sm text-muted-foreground">No custom models configured</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add a custom endpoint to use with any OpenAI-compatible API
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {customModels.map((model) => (
            <div
              key={model.id}
              className="rounded-lg border border-border bg-[#242424] p-4 flex items-center gap-4"
            >
              <div className="rounded-md bg-muted p-2 shrink-0">
                <Server className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{model.displayName}</span>
                  <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                    {model.provider}
                  </span>
                  <StatusDot status={model.status} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {model.baseUrl} &mdash; {model.modelId}
                </p>
                {model.status === 'error' && model.errorMessage && (
                  <p className="text-xs text-red-500 mt-0.5">{model.errorMessage}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(model)}
                  className="h-8 w-8 p-0"
                >
                  <Edit2 className="h-4 w-4" />
                  <span className="sr-only">Edit</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(model.id)}
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Delete</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ModelFormDialog
        open={dialogOpen}
        initial={editTarget}
        onClose={() => {
          setDialogOpen(false);
          setEditTarget(null);
        }}
        onSave={handleSave}
      />
    </div>
  );
}

export default CustomModelsSettings;

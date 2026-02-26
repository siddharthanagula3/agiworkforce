'use client';

import { useCallback, useState } from 'react';
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
import type { CustomModelConfig } from '@agiworkforce/types';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from '@/components/ui';

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
        let chatResp;
        try {
            chatResp = await fetch(`${baseUrl}/chat/completions`, {
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
        } catch (e: any) {
            if (e.name === 'AbortError') throw e;
            return { connected: false, error: e instanceof Error ? e.message : 'Connection failed' };
        }
    } catch (e) {
        return { connected: false, error: e instanceof Error ? e.message : 'Connection timeout or failed' };
    }
}

function generateId(provider: string, modelId: string): string {
    const slug = `${provider.toLowerCase().replace(/\s+/g, '-')}/${modelId.toLowerCase().replace(/\s+/g, '-')}`;
    return `${slug}-${Date.now().toString(36)}`;
}

function StatusDot({ status }: { status: CustomModelConfig['status'] }) {
    if (status === 'connected') {
        return (
            <span className="flex items-center gap-1 text-xs text-emerald-500">
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
        <span className="flex items-center gap-1 text-xs text-zinc-500">
            <span className="h-2 w-2 rounded-full bg-zinc-600 inline-block" />
            Unchecked
        </span>
    );
}

interface ModelFormDialogProps {
    open: boolean;
    initial?: CustomModelConfig | null;
    onClose: () => void;
    onSave: (config: CustomModelConfig) => void;
}

function ModelFormDialog({ open, initial, onClose, onSave }: ModelFormDialogProps) {
    const [form, setForm] = useState<ModelFormState>(() => {
        if (initial) {
            return {
                displayName: initial.displayName,
                provider: initial.provider,
                baseUrl: initial.baseUrl,
                modelId: initial.modelId,
                apiKey: '',
                contextWindow: initial.contextWindow,
                supportsStreaming: initial.supportsStreaming,
                supportsTools: initial.supportsTools,
                supportsVision: initial.supportsVision,
            };
        }
        return DEFAULT_FORM;
    });
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<VerifyResult | null>(null);
    const [formError, setFormError] = useState<string | null>(null);

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
            apiKeyRef: form.apiKey.trim() ? form.apiKey.trim() : initial?.apiKeyRef ?? null,
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
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit Custom Model' : 'Add Custom Model'}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                    {formError && (
                        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 rounded-md p-3">
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
                            <span className="text-zinc-500 font-normal">(optional for local models)</span>
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

                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-3">
                        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
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
                            className={`flex items-center gap-2 text-sm rounded-md p-3 ${testResult.connected
                                    ? 'bg-emerald-500/10 text-emerald-500'
                                    : 'bg-red-500/10 text-red-500'
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

                    <div className="flex gap-2 pt-2 justify-end">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleTest()}
                            disabled={testing}
                            className="mr-auto"
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
    const { customModels, addCustomModel, updateCustomModel, removeCustomModel } = useSettingsStore();
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
                    <h4 className="font-medium text-zinc-200">Custom Model Endpoints</h4>
                    <p className="text-sm text-zinc-500 mt-1">
                        Add OpenAI-compatible endpoints: Groq, Ollama, LM Studio, etc. Note: these keys are stored securely in your browser.
                    </p>
                </div>
                <Button size="sm" onClick={handleAdd}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Model
                </Button>
            </div>

            {customModels.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-800 p-8 text-center bg-zinc-900/30">
                    <Server className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
                    <p className="text-sm font-medium text-zinc-300">No custom models configured</p>
                    <p className="text-xs text-zinc-500 mt-1 max-w-[250px] mx-auto">
                        Connect to a local AI or add API keys for specific cloud providers.
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {customModels.map((model) => (
                        <div
                            key={model.id}
                            className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 flex items-center gap-4 transition-colors hover:bg-zinc-900"
                        >
                            <div className="rounded-md bg-zinc-800 p-2 shrink-0">
                                <Server className="h-4 w-4 text-zinc-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm text-zinc-200">{model.displayName}</span>
                                    <span className="text-xs font-medium text-zinc-400 bg-zinc-800 rounded px-1.5 py-0.5">
                                        {model.provider}
                                    </span>
                                    <StatusDot status={model.status} />
                                </div>
                                <p className="text-xs text-zinc-500 mt-1 truncate">
                                    {model.baseUrl} &mdash; {model.modelId}
                                </p>
                                {model.status === 'error' && model.errorMessage && (
                                    <p className="text-xs text-red-500 mt-1 truncate">{model.errorMessage}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleEdit(model)}
                                    className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
                                >
                                    <Edit2 className="h-4 w-4" />
                                    <span className="sr-only">Edit</span>
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDelete(model.id)}
                                    className="h-8 w-8 text-zinc-400 hover:text-red-400 hover:bg-red-400/10"
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

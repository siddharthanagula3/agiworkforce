import React from 'react';
import { RefreshCw } from 'lucide-react';

import {
  formatModelSize,
  ollamaGetKeepAlive,
  ollamaListLoadedModels,
  ollamaLoadModel,
  ollamaSetKeepAlive,
  ollamaUnloadModel,
  type OllamaLoadedModel,
} from '@/api/ollama';
import { invoke } from '@/lib/tauri-mock';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/Select';
import { Spinner } from '@/ui/Spinner';

const SERVER_DEFAULT = 'default';
const KEEP_LOADED_SECONDS = -1;
const STAYS_LOADED_AFTER_MS = 365 * 24 * 60 * 60 * 1000;

const KEEP_ALIVE_CHOICES: ReadonlyArray<{ seconds: number; label: string }> = [
  { seconds: 0, label: 'Unload right after each reply' },
  { seconds: 5 * 60, label: '5 minutes' },
  { seconds: 15 * 60, label: '15 minutes' },
  { seconds: 60 * 60, label: '1 hour' },
  { seconds: 4 * 60 * 60, label: '4 hours' },
  { seconds: KEEP_LOADED_SECONDS, label: 'Until Ollama stops' },
];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function describeIdleUnload(expiresAt: string | null, now: number = Date.now()): string {
  if (!expiresAt) return '';
  const expires = Date.parse(expiresAt);
  if (Number.isNaN(expires)) return '';
  const remainingMs = expires - now;
  if (remainingMs > STAYS_LOADED_AFTER_MS) return 'Stays loaded';
  if (remainingMs <= 0) return 'Unloading';
  const minutes = Math.ceil(remainingMs / 60_000);
  if (minutes < 60) return `Unloads in ${minutes} min if idle`;
  const hours = Math.round(minutes / 60);
  return `Unloads in ${hours} h if idle`;
}

export function describeLoadedModel(model: OllamaLoadedModel, now: number = Date.now()): string {
  const onGpu =
    model.size > 0 && model.size_vram > 0
      ? `${Math.round((Math.min(model.size_vram, model.size) / model.size) * 100)}% on GPU`
      : '';
  return [
    model.parameter_size,
    model.quantization_level,
    model.size > 0 ? formatModelSize(model.size) : '',
    onGpu,
    describeIdleUnload(model.expires_at, now),
  ]
    .filter(Boolean)
    .join(' · ');
}

function MemoryRow({
  name,
  detail,
  busy,
  disabled,
  onUnload,
}: {
  name: string;
  detail: string;
  busy: boolean;
  disabled: boolean;
  onUnload: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onUnload}
        disabled={disabled}
        aria-busy={busy}
        aria-label={`Unload ${name}`}
      >
        {busy ? <Spinner size="sm" className="mr-2 h-3 w-3" /> : null}
        Unload
      </Button>
    </li>
  );
}

function LoadControl({
  id,
  choices,
  busyModel,
  disabled,
  onLoad,
}: {
  id: string;
  choices: ReadonlyArray<{ value: string; label: string }>;
  busyModel: string | null;
  disabled: boolean;
  onLoad: (value: string) => void;
}) {
  const [selected, setSelected] = React.useState('');
  const current = choices.some((choice) => choice.value === selected) ? selected : '';

  if (choices.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Select value={current} onValueChange={setSelected}>
        <SelectTrigger id={id} aria-label="Model to load" className="h-9 min-w-0 flex-1">
          <SelectValue placeholder="Choose a model to load" />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onLoad(current)}
        disabled={disabled || !current}
        aria-busy={busyModel !== null && busyModel === current}
      >
        {busyModel !== null && busyModel === current ? (
          <Spinner size="sm" className="mr-2 h-3 w-3" />
        ) : null}
        Load
      </Button>
    </div>
  );
}

function MemoryHeader({
  title,
  refreshing,
  onRefresh,
}: {
  title: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs font-medium text-foreground">{title}</p>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label={`Refresh ${title.toLowerCase()}`}
        title={`Refresh ${title.toLowerCase()}`}
        className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <RefreshCw
          className={
            refreshing ? 'h-3.5 w-3.5 animate-spin motion-reduce:animate-none' : 'h-3.5 w-3.5'
          }
        />
      </button>
    </div>
  );
}

export function OllamaMemorySettings({ installedModels }: { installedModels: string[] }) {
  const baseUrl = useSettingsStore((state) => state.llmConfig.ollamaUrl || undefined);
  const allowPrivateNetwork = useSettingsStore(
    (state) => state.llmConfig.allowPrivateNetworkRuntimes === true,
  );
  const [loaded, setLoaded] = React.useState<OllamaLoadedModel[] | null>(null);
  const [refreshing, setRefreshing] = React.useState(true);
  const [busyModel, setBusyModel] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [keepAlive, setKeepAlive] = React.useState<number | null>(null);
  const [keepAliveKnown, setKeepAliveKnown] = React.useState(false);
  const [savingKeepAlive, setSavingKeepAlive] = React.useState(false);
  const [keepAliveError, setKeepAliveError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      setLoaded(await ollamaListLoadedModels(baseUrl, allowPrivateNetwork));
      setError(null);
    } catch (err) {
      setLoaded(null);
      setError(errorText(err));
    } finally {
      setRefreshing(false);
    }
  }, [allowPrivateNetwork, baseUrl]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    let cancelled = false;
    ollamaGetKeepAlive()
      .then((seconds) => {
        if (cancelled) return;
        setKeepAlive(seconds);
        setKeepAliveKnown(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setKeepAliveError(errorText(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeMemory = async (modelName: string, change: () => Promise<void>) => {
    setBusyModel(modelName);
    setError(null);
    try {
      await change();
      await refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyModel(null);
    }
  };

  const saveKeepAlive = async (value: string) => {
    const next = value === SERVER_DEFAULT ? null : Number(value);
    setSavingKeepAlive(true);
    setKeepAliveError(null);
    try {
      setKeepAlive(await ollamaSetKeepAlive(next));
      setKeepAliveKnown(true);
    } catch (err) {
      setKeepAliveError(errorText(err));
    } finally {
      setSavingKeepAlive(false);
    }
  };

  const loadedNames = new Set((loaded ?? []).map((model) => model.name));
  const loadChoices = installedModels
    .filter((name) => !loadedNames.has(name))
    .map((name) => ({ value: name, label: name }));
  const keepAliveChoices =
    keepAlive === null || KEEP_ALIVE_CHOICES.some((choice) => choice.seconds === keepAlive)
      ? KEEP_ALIVE_CHOICES
      : [...KEEP_ALIVE_CHOICES, { seconds: keepAlive, label: `${keepAlive} seconds` }];
  const now = Date.now();

  return (
    <div className="space-y-3 rounded-md border border-border/70 bg-background/70 p-3">
      <MemoryHeader
        title="Models in memory"
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      />

      {loaded === null && refreshing ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner size="sm" className="h-3 w-3" />
          <span>Checking what Ollama has loaded</span>
        </div>
      ) : loaded && loaded.length > 0 ? (
        <ul className="divide-y divide-border">
          {loaded.map((model) => (
            <MemoryRow
              key={model.name}
              name={model.name}
              detail={describeLoadedModel(model, now)}
              busy={busyModel === model.name}
              disabled={busyModel !== null}
              onUnload={() =>
                void changeMemory(model.name, () =>
                  ollamaUnloadModel(model.name, baseUrl, allowPrivateNetwork),
                )
              }
            />
          ))}
        </ul>
      ) : loaded ? (
        <p className="text-xs text-muted-foreground">
          No model is in memory. Ollama loads one on the first message that uses it, or you can load
          one now.
        </p>
      ) : null}

      <LoadControl
        id="ollama-model-load"
        choices={loadChoices}
        busyModel={busyModel}
        disabled={busyModel !== null || loaded === null}
        onLoad={(name) =>
          void changeMemory(name, () => ollamaLoadModel(name, baseUrl, allowPrivateNetwork))
        }
      />

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      <div className="space-y-1.5 border-t border-border pt-3">
        <label htmlFor="ollama-keep-alive" className="text-xs font-medium text-foreground">
          Keep models in memory for
        </label>
        <Select
          value={keepAlive === null ? SERVER_DEFAULT : String(keepAlive)}
          onValueChange={(value) => void saveKeepAlive(value)}
          disabled={!keepAliveKnown || savingKeepAlive}
        >
          <SelectTrigger id="ollama-keep-alive" className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SERVER_DEFAULT}>Ollama decides (5 minutes by default)</SelectItem>
            {keepAliveChoices.map((choice) => (
              <SelectItem key={choice.seconds} value={String(choice.seconds)}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {keepAliveError ? (
          <p role="alert" className="text-xs text-danger">
            {keepAliveError}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            How long Ollama holds a model after a reply. A longer time answers the next message
            sooner and keeps the memory in use. Applies from the next message.
          </p>
        )}
      </div>
    </div>
  );
}

interface LmStudioModelState {
  key: string;
  display_name: string;
  size_bytes: number;
  loaded_instance_ids: string[];
}

export function LmStudioMemory({ onChanged }: { onChanged: () => void }) {
  const [models, setModels] = React.useState<LmStudioModelState[] | null>(null);
  const [refreshing, setRefreshing] = React.useState(true);
  const [busyModel, setBusyModel] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await invoke<LmStudioModelState[]>('llm_lmstudio_list_model_states');
      setModels(Array.isArray(next) ? next : []);
      setError(null);
    } catch (err) {
      setModels(null);
      setError(errorText(err));
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const changeMemory = async (busyKey: string, change: () => Promise<unknown>) => {
    setBusyModel(busyKey);
    setError(null);
    try {
      await change();
      await refresh();
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusyModel(null);
    }
  };

  const loadedInstances = (models ?? []).flatMap((model) =>
    model.loaded_instance_ids.map((instanceId) => ({ instanceId, model })),
  );
  const loadChoices = (models ?? [])
    .filter((model) => model.loaded_instance_ids.length === 0)
    .map((model) => ({ value: model.key, label: model.display_name }));

  return (
    <div className="mt-3 space-y-3 rounded-md border border-border/70 bg-background/70 p-3">
      <MemoryHeader
        title="Models in memory"
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      />

      {models === null && refreshing ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner size="sm" className="h-3 w-3" />
          <span>Checking what LM Studio has loaded</span>
        </div>
      ) : loadedInstances.length > 0 ? (
        <ul className="divide-y divide-border">
          {loadedInstances.map(({ instanceId, model }) => (
            <MemoryRow
              key={instanceId}
              name={instanceId === model.key ? model.display_name : instanceId}
              detail={model.size_bytes > 0 ? formatModelSize(model.size_bytes) : ''}
              busy={busyModel === instanceId}
              disabled={busyModel !== null}
              onUnload={() =>
                void changeMemory(instanceId, () =>
                  invoke('llm_lmstudio_unload_model', { instanceId }),
                )
              }
            />
          ))}
        </ul>
      ) : models ? (
        <p className="text-xs text-muted-foreground">No model is in memory.</p>
      ) : null}

      <LoadControl
        id="lmstudio-model-load"
        choices={loadChoices}
        busyModel={busyModel}
        disabled={busyModel !== null || models === null}
        onLoad={(model) =>
          void changeMemory(model, () => invoke('llm_lmstudio_load_model', { model }))
        }
      />

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

import { create } from 'zustand';
import {
  getCapabilities,
  getModelById as getCatalogModelById,
  tier2LoadModel,
} from '@agiworkforce/local-llm';
import {
  getInstalledModel,
  listInstalledModels,
  recordInstalledModel,
} from '@/storage/installedModels';
import type { InstalledModel } from '@/storage/types';
import type { ModelDef } from './service';

export type ModelInstallStatus =
  | 'ready'
  | 'download_required'
  | 'downloading'
  | 'failed'
  | 'unavailable'
  | 'locked';

export interface ModelInstallJob {
  status: ModelInstallStatus;
  progress: number;
  error?: string;
}

interface ModelInstallState {
  installedModelIds: string[];
  readySystemModelIds: string[];
  jobs: Record<string, ModelInstallJob>;
  hydrateInstalledModels: () => Promise<void>;
  prepareModel: (model: ModelDef) => Promise<void>;
  statusForModel: (model: ModelDef) => ModelInstallJob;
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  if (progress > 1 && progress <= 100) return Math.max(0, Math.min(1, progress / 100));
  return Math.max(0, Math.min(1, progress));
}

function isBuiltIn(model: ModelDef): boolean {
  return model.surface === 'local' && (model.fileSizeBytes ?? 0) <= 0;
}

function defaultStatusForModel(
  model: ModelDef,
  installedModelIds: string[],
  readySystemModelIds: string[],
): ModelInstallJob {
  if (model.availability === 'locked') {
    return { status: 'locked', progress: 0, error: model.lockReason };
  }
  if (installedModelIds.includes(model.id)) {
    return { status: 'ready', progress: 1 };
  }
  if (isBuiltIn(model)) {
    if (readySystemModelIds.includes(model.id)) {
      return { status: 'ready', progress: 1 };
    }
    return {
      status: 'unavailable',
      progress: 0,
      error: 'This system model is not available on this device yet.',
    };
  }

  const preset = model.executorchPreset ?? getCatalogModelById(model.id)?.executorchPreset;
  if (!preset && model.availability === 'download_required') {
    return {
      status: 'unavailable',
      progress: 0,
      error: 'The native package for this model is not bundled yet.',
    };
  }

  return { status: model.availability, progress: 0 };
}

function installedRecordFor(model: ModelDef): InstalledModel {
  const catalogModel = getCatalogModelById(model.id);
  return {
    id: model.id,
    display_name: model.name,
    runtime: 'local',
    format: 'pte',
    size_bytes: model.fileSizeBytes ?? 0,
    sha256: null,
    local_path: null,
    installed_at: Date.now(),
    last_used_at: null,
    capabilities: JSON.stringify({
      ...(catalogModel?.capabilities ?? {}),
      supportedRuntimes: catalogModel?.supportedRuntimes ?? [],
      managedBy: 'react-native-executorch',
    }),
  };
}

export const useModelInstallStore = create<ModelInstallState>()((set, get) => ({
  installedModelIds: [],
  readySystemModelIds: [],
  jobs: {},

  hydrateInstalledModels: async () => {
    const [installed, caps] = await Promise.all([
      listInstalledModels().catch(() => []),
      getCapabilities().catch(() => null),
    ]);
    const readySystemModelIds =
      caps?.tier1Runtime === 'foundation_models'
        ? ['apple-foundation-models']
        : caps?.tier1Runtime === 'aicore'
          ? ['gemini-nano-aicore']
          : [];
    set({ installedModelIds: installed.map((model) => model.id), readySystemModelIds });
  },

  prepareModel: async (model) => {
    if (model.availability === 'locked' || model.surface !== 'local') {
      set((state) => ({
        jobs: {
          ...state.jobs,
          [model.id]: {
            status: 'locked',
            progress: 0,
            error: model.lockReason ?? 'This model is locked.',
          },
        },
      }));
      return;
    }

    if (isBuiltIn(model)) {
      const isReady = get().readySystemModelIds.includes(model.id);
      if (!isReady) {
        const error = 'This system model is not available on this device yet.';
        set((state) => ({
          jobs: { ...state.jobs, [model.id]: { status: 'unavailable', progress: 0, error } },
        }));
        throw new Error(error);
      }

      set((state) => ({
        installedModelIds: Array.from(new Set([...state.installedModelIds, model.id])),
        jobs: { ...state.jobs, [model.id]: { status: 'ready', progress: 1 } },
      }));
      return;
    }

    const existing = await getInstalledModel(model.id).catch(() => null);
    if (existing) {
      set((state) => ({
        installedModelIds: Array.from(new Set([...state.installedModelIds, model.id])),
        jobs: { ...state.jobs, [model.id]: { status: 'ready', progress: 1 } },
      }));
      return;
    }

    const catalogModel = getCatalogModelById(model.id);
    const preset = model.executorchPreset ?? catalogModel?.executorchPreset;
    if (!preset) {
      const error = 'The native package for this model is not bundled yet.';
      set((state) => ({
        jobs: { ...state.jobs, [model.id]: { status: 'unavailable', progress: 0, error } },
      }));
      throw new Error(error);
    }

    set((state) => ({
      jobs: { ...state.jobs, [model.id]: { status: 'downloading', progress: 0.01 } },
    }));

    try {
      await tier2LoadModel(preset, (progress) => {
        set((state) => ({
          jobs: {
            ...state.jobs,
            [model.id]: {
              status: 'downloading',
              progress: Math.max(0.01, clampProgress(progress)),
            },
          },
        }));
      });

      const record = installedRecordFor(model);
      await recordInstalledModel(record);

      set((state) => ({
        installedModelIds: Array.from(new Set([...state.installedModelIds, model.id])),
        jobs: { ...state.jobs, [model.id]: { status: 'ready', progress: 1 } },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((state) => ({
        jobs: {
          ...state.jobs,
          [model.id]: { status: 'failed', progress: 0, error: message },
        },
      }));
      throw err;
    }
  },

  statusForModel: (model) => {
    return (
      get().jobs[model.id] ??
      defaultStatusForModel(model, get().installedModelIds, get().readySystemModelIds)
    );
  },
}));

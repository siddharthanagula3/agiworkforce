import { create } from 'zustand';
import {
  getCapabilities,
  getModelById as getCatalogModelById,
  tier1PrepareModel,
  tier2LoadModel,
} from '@agiworkforce/local-llm';
import {
  getInstalledModel,
  listInstalledModels,
  recordInstalledModel,
} from '@/storage/installedModels';
import { downloadModel } from '@/services/modelDownload';
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

  const catalogModel = getCatalogModelById(model.id);
  const preset = model.executorchPreset ?? catalogModel?.executorchPreset;
  const hasGenericDownload = Boolean(catalogModel?.downloadUrl && catalogModel?.checksum);
  if (!preset && !hasGenericDownload && model.availability === 'download_required') {
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
    // gemini-nano-aicore is no longer a zero-download OS-resident model (it's a
    // downloaded tasks-genai .task file — see catalog.ts), so it's intentionally
    // absent here; its readiness is tracked via installedModelIds instead, same
    // as any other downloadable model.
    const readySystemModelIds =
      caps?.tier1Runtime === 'foundation_models' ? ['apple-foundation-models'] : [];
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

    if (!preset && catalogModel?.downloadUrl && catalogModel?.checksum) {
      set((state) => ({
        jobs: { ...state.jobs, [model.id]: { status: 'downloading', progress: 0.01 } },
      }));

      try {
        const record = await downloadModel({
          modelId: catalogModel.id,
          displayName: catalogModel.displayName,
          downloadUrl: catalogModel.downloadUrl,
          checksum: catalogModel.checksum,
          fileSizeBytes: catalogModel.fileSizeBytes,
          runtime: 'local',
          format: catalogModel.format ?? 'gguf',
          onProgress: (downloaded, total) => {
            set((state) => ({
              jobs: {
                ...state.jobs,
                [model.id]: {
                  status: 'downloading',
                  progress: Math.max(0.01, clampProgress(total > 0 ? downloaded / total : 0)),
                },
              },
            }));
          },
        });

        if (catalogModel.supportedRuntimes.includes('aicore') && record.local_path) {
          await tier1PrepareModel(record.local_path);
        }

        set((state) => ({
          installedModelIds: Array.from(new Set([...state.installedModelIds, model.id])),
          jobs: { ...state.jobs, [model.id]: { status: 'ready', progress: 1 } },
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set((state) => ({
          jobs: { ...state.jobs, [model.id]: { status: 'failed', progress: 0, error: message } },
        }));
        throw err;
      }
      return;
    }

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

import { create } from 'zustand';
import {
  getCapabilities,
  getModelById as getCatalogModelById,
  hasRunnableGgufArtifacts,
  tier2LoadModel,
} from '@agiworkforce/local-llm';
import type { OnDeviceModel } from '@agiworkforce/types';
import { downloadModel } from '@/services/modelDownload';
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

  const catalogModel = getCatalogModelById(model.id);
  const preset = model.executorchPreset ?? catalogModel?.executorchPreset;
  const ggufInstallable = catalogModel ? hasRunnableGgufArtifacts(catalogModel) : false;
  if (!preset && !ggufInstallable && model.availability === 'download_required') {
    return {
      status: 'unavailable',
      progress: 0,
      error: 'The native package for this model is not bundled yet.',
    };
  }

  return { status: model.availability, progress: 0 };
}

/**
 * Download + verify a llama-rn GGUF model (base weights and, for vision models,
 * the side-by-side mmproj projector) through services/modelDownload — resumable,
 * checksum-verified, Wi-Fi-gated, and recorded in installed_models with a real
 * local_path so the tier-3 runtime can load it.
 */
async function installGgufModel(
  catalogModel: OnDeviceModel,
  onProgress: (fraction: number) => void,
): Promise<void> {
  await downloadModel({
    modelId: catalogModel.id,
    displayName: catalogModel.displayName,
    downloadUrl: catalogModel.downloadUrl!,
    checksum: catalogModel.checksum!,
    fileSizeBytes: catalogModel.fileSizeBytes,
    runtime: 'local',
    format: 'gguf',
    mmprojUrl: catalogModel.mmprojUrl,
    mmprojChecksum: catalogModel.mmprojChecksum,
    mmprojSizeBytes: catalogModel.mmprojSizeBytes,
    capabilities: JSON.stringify({
      ...catalogModel.capabilities,
      supportedRuntimes: catalogModel.supportedRuntimes,
      managedBy: 'llama.rn',
    }),
    onProgress: (downloaded, total) => {
      onProgress(total > 0 ? downloaded / total : 0);
    },
  });
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
    const ggufInstallable = !preset && catalogModel && hasRunnableGgufArtifacts(catalogModel);
    if (!preset && !ggufInstallable) {
      const error = 'The native package for this model is not bundled yet.';
      set((state) => ({
        jobs: { ...state.jobs, [model.id]: { status: 'unavailable', progress: 0, error } },
      }));
      throw new Error(error);
    }

    set((state) => ({
      jobs: { ...state.jobs, [model.id]: { status: 'downloading', progress: 0.01 } },
    }));

    const reportProgress = (progress: number): void => {
      set((state) => ({
        jobs: {
          ...state.jobs,
          [model.id]: {
            status: 'downloading',
            progress: Math.max(0.01, clampProgress(progress)),
          },
        },
      }));
    };

    try {
      if (preset) {
        await tier2LoadModel(preset, reportProgress);
        // The ExecuTorch module manages the files itself — record local_path null.
        const record = installedRecordFor(model);
        await recordInstalledModel(record);
      } else {
        // llama-rn GGUF path — downloadModel verifies checksums and writes the
        // installed_models record (with a real local_path) itself.
        await installGgufModel(catalogModel!, reportProgress);
      }

      set((state) => ({
        installedModelIds: Array.from(new Set([...state.installedModelIds, model.id])),
        jobs: { ...state.jobs, [model.id]: { status: 'ready', progress: 1 } },
      }));
    } catch (err) {
      // Log the real failure (e.g. expo-sqlite's "Calling the 'execAsync'
      // function has failed" from the encrypted metadata write) for
      // diagnostics, but never show internal driver errors to the user.
      console.error(`[installStore] prepareModel(${model.id}) failed:`, err);
      set((state) => ({
        jobs: {
          ...state.jobs,
          [model.id]: {
            status: 'failed',
            progress: 0,
            error: 'Unable to prepare the model. Please try again.',
          },
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

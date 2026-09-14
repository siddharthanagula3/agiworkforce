import { create } from 'zustand';
import {
  getCapabilities,
  getModelById as getCatalogModelById,
  getSystemModelForTier1Runtime,
  hasRunnableGgufArtifacts,
  hasSufficientRAMForMultimodal,
  isMultimodalModel,
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
import { isAutoMode, isCloudManagedModelId } from './service';
import type { ModelDef } from './service';
import { useModelStore } from './store';

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
  totalRAMMB: number | null;
  jobs: Record<string, ModelInstallJob>;
  hydrateInstalledModels: () => Promise<void>;
  prepareModel: (model: ModelDef) => Promise<void>;
  statusForModel: (model: ModelDef) => ModelInstallJob;
}

export const MULTIMODAL_RAM_LOCK_REASON =
  'This device needs at least 3.5 GB of RAM to run on-device vision models.';

function multimodalRamLock(model: ModelDef, totalRAMMB: number | null): ModelInstallJob | null {
  const catalogModel = getCatalogModelById(model.id);
  if (!catalogModel || !isMultimodalModel(catalogModel)) return null;
  if (hasSufficientRAMForMultimodal(totalRAMMB ?? 0)) return null;
  return { status: 'locked', progress: 0, error: MULTIMODAL_RAM_LOCK_REASON };
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
  totalRAMMB: number | null,
): ModelInstallJob {
  if (model.availability === 'locked') {
    return { status: 'locked', progress: 0, error: model.lockReason };
  }
  const ramLock = multimodalRamLock(model, totalRAMMB);
  if (ramLock) return ramLock;
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

// A local selection that is not on disk cannot answer anything, so the first
// send fails on a model the user never downloaded. Prefer the built-in system
// model, which needs no download, then anything already installed.
export function pickReadyLocalModelId(
  selectedModelId: string,
  installedModelIds: readonly string[],
  readySystemModelIds: readonly string[],
): string | null {
  if (isCloudManagedModelId(selectedModelId) || isAutoMode(selectedModelId)) return null;
  if (readySystemModelIds.includes(selectedModelId)) return null;
  if (installedModelIds.includes(selectedModelId)) return null;
  return readySystemModelIds[0] ?? installedModelIds[0] ?? null;
}

// Resolve the local model to run now: the given id when it is on disk, else a
// ready one.
export function readyLocalModelIdOr(fallbackModelId: string): string {
  const { installedModelIds, readySystemModelIds } = useModelInstallStore.getState();
  return (
    pickReadyLocalModelId(fallbackModelId, installedModelIds, readySystemModelIds) ??
    fallbackModelId
  );
}

function activateReadyLocalModel(
  installedModelIds: readonly string[],
  readySystemModelIds: readonly string[],
): void {
  const { selectedModel, setModel } = useModelStore.getState();
  const replacement = pickReadyLocalModelId(selectedModel, installedModelIds, readySystemModelIds);
  if (replacement) setModel(replacement);
}

export const useModelInstallStore = create<ModelInstallState>()((set, get) => ({
  installedModelIds: [],
  readySystemModelIds: [],
  totalRAMMB: null,
  jobs: {},

  hydrateInstalledModels: async () => {
    const [installed, caps] = await Promise.all([
      listInstalledModels().catch(() => []),
      getCapabilities().catch(() => null),
    ]);
    const systemModel = getSystemModelForTier1Runtime(caps?.tier1Runtime ?? null);
    const readySystemModelIds = systemModel ? [systemModel.id] : [];
    const installedModelIds = installed.map((model) => model.id);
    set({
      installedModelIds,
      readySystemModelIds,
      totalRAMMB: caps?.totalRAMMB ?? null,
    });
    activateReadyLocalModel(installedModelIds, readySystemModelIds);
  },

  prepareModel: async (model) => {
    if (getCatalogModelById(model.id) && isMultimodalModel(getCatalogModelById(model.id)!)) {
      const caps = await getCapabilities().catch(() => null);
      const ramLock = multimodalRamLock(model, caps?.totalRAMMB ?? get().totalRAMMB);
      if (ramLock) {
        set((state) => ({
          totalRAMMB: caps?.totalRAMMB ?? state.totalRAMMB,
          jobs: { ...state.jobs, [model.id]: ramLock },
        }));
        throw new Error(MULTIMODAL_RAM_LOCK_REASON);
      }
    }

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
        const record = installedRecordFor(model);
        await recordInstalledModel(record);
      } else {
        await installGgufModel(catalogModel!, reportProgress);
      }

      set((state) => ({
        installedModelIds: Array.from(new Set([...state.installedModelIds, model.id])),
        jobs: { ...state.jobs, [model.id]: { status: 'ready', progress: 1 } },
      }));
    } catch (err) {
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
      defaultStatusForModel(
        model,
        get().installedModelIds,
        get().readySystemModelIds,
        get().totalRAMMB,
      )
    );
  },
}));

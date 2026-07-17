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
  /**
   * Device RAM from the native capability probe, captured on hydrate.
   * `null` until detection has run; treated as 0 (fail-closed) by the
   * multimodal RAM gate, matching the package's default-deny posture.
   */
  totalRAMMB: number | null;
  jobs: Record<string, ModelInstallJob>;
  hydrateInstalledModels: () => Promise<void>;
  prepareModel: (model: ModelDef) => Promise<void>;
  statusForModel: (model: ModelDef) => ModelInstallJob;
}

/**
 * Honest disabled-state reason for the tier-3 multimodal RAM gate
 * (restructure §8 device gates). Shown instead of hiding the row.
 */
export const MULTIMODAL_RAM_LOCK_REASON =
  'This device needs at least 3.5 GB of RAM to run on-device vision models.';

/**
 * RAM gate for tier-3 llama.rn multimodal rows (base GGUF + mmproj loaded
 * together). Applies only to mmproj-backed vision models — text-only and
 * tier-2 rows are governed by their own runtime gates. Fail-closed on an
 * unknown RAM reading.
 */
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
  // Device RAM gate before install/ready states: an under-provisioned device
  // sees an honest disabled row (with the reason), never a download button
  // for a model it cannot load.
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
  totalRAMMB: null,
  jobs: {},

  hydrateInstalledModels: async () => {
    const [installed, caps] = await Promise.all([
      listInstalledModels().catch(() => []),
      getCapabilities().catch(() => null),
    ]);
    const systemModel = getSystemModelForTier1Runtime(caps?.tier1Runtime ?? null);
    const readySystemModelIds = systemModel ? [systemModel.id] : [];
    set({
      installedModelIds: installed.map((model) => model.id),
      readySystemModelIds,
      totalRAMMB: caps?.totalRAMMB ?? null,
    });
  },

  prepareModel: async (model) => {
    // Authoritative RAM re-check (not just the hydrate-time snapshot) so a
    // below-threshold device can never start a multimodal download even if
    // the UI raced hydration.
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
      defaultStatusForModel(
        model,
        get().installedModelIds,
        get().readySystemModelIds,
        get().totalRAMMB,
      )
    );
  },
}));

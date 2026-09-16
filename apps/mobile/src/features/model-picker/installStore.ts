import { NativeModules } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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
import { assertDownloadAllowed, cancelDownload, downloadModel } from '@/services/modelDownload';
import type { ModelDownloadErrorKind } from '@/services/modelDownload';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
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
  'ready' | 'download_required' | 'downloading' | 'failed' | 'unavailable' | 'locked';

export const GENERIC_INSTALL_FAILURE = 'Unable to prepare the model. Please try again.';

function downloadFailureKind(error: unknown): ModelDownloadErrorKind | null {
  if (!(error instanceof Error) || error.name !== 'ModelDownloadError') return null;
  const kind = (error as Error & { kind?: unknown }).kind;
  return typeof kind === 'string' ? (kind as ModelDownloadErrorKind) : null;
}

/**
 * A download failure names its real cause. Anything untyped keeps the generic
 * wording rather than inventing a reason the code cannot stand behind.
 */
export function installFailureMessage(error: unknown): string {
  if (downloadFailureKind(error) && error instanceof Error) return error.message;
  return GENERIC_INSTALL_FAILURE;
}

export interface ModelInstallJob {
  status: ModelInstallStatus;
  progress: number;
  error?: string;
}

interface ModelInstallState {
  installedModelIds: string[];
  readySystemModelIds: string[];
  totalRAMMB: number | null;
  allowCellularDownloads: boolean;
  jobs: Record<string, ModelInstallJob>;
  setAllowCellularDownloads: (allowed: boolean) => void;
  hydrateInstalledModels: () => Promise<void>;
  prepareModel: (model: ModelDef) => Promise<void>;
  cancelModelDownload: (modelId: string) => void;
  forgetInstalledModel: (modelId: string) => void;
  statusForModel: (model: ModelDef) => ModelInstallJob;
}

/**
 * AICore fetches its OS-resident model on its own once the app asks for
 * capabilities, so the same consent has to reach the native side or the Android
 * Tier 1 download ignores it.
 */
function pushCellularConsentToNative(allowed: boolean): void {
  const aicore = (NativeModules as Record<string, unknown>)['AGIAICore'] as
    { setCellularDownloadAllowed?: (allowed: boolean) => void } | undefined;
  aicore?.setCellularDownloadAllowed?.(allowed);
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
  wifiOnly: boolean,
): Promise<void> {
  await downloadModel({
    wifiOnly,
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
  isDownloading = false,
): string | null {
  if (isCloudManagedModelId(selectedModelId) || isAutoMode(selectedModelId)) return null;
  if (readySystemModelIds.includes(selectedModelId)) return null;
  if (installedModelIds.includes(selectedModelId)) return null;
  // A download in flight is a choice the user just made. Moving off it would
  // undo that choice and leave the finished model unselected.
  if (isDownloading) return null;
  return readySystemModelIds[0] ?? installedModelIds[0] ?? null;
}

// Resolve the local model to run now: the given id when it is on disk, else a
// ready one.
export function readyLocalModelIdOr(fallbackModelId: string): string {
  const { installedModelIds, readySystemModelIds, jobs } = useModelInstallStore.getState();
  return (
    pickReadyLocalModelId(
      fallbackModelId,
      installedModelIds,
      readySystemModelIds,
      jobs[fallbackModelId]?.status === 'downloading',
    ) ?? fallbackModelId
  );
}

function activateReadyLocalModel(
  installedModelIds: readonly string[],
  readySystemModelIds: readonly string[],
  jobs: Record<string, ModelInstallJob>,
): void {
  const { selectedModel, setModel } = useModelStore.getState();
  const replacement = pickReadyLocalModelId(
    selectedModel,
    installedModelIds,
    readySystemModelIds,
    jobs[selectedModel]?.status === 'downloading',
  );
  if (replacement) setModel(replacement);
}

export const useModelInstallStore = create<ModelInstallState>()(
  persist(
    (set, get) => ({
      installedModelIds: [],
      readySystemModelIds: [],
      totalRAMMB: null,
      allowCellularDownloads: false,
      jobs: {},

      setAllowCellularDownloads: (allowed) => {
        set({ allowCellularDownloads: allowed });
        pushCellularConsentToNative(allowed);
      },

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
        pushCellularConsentToNative(get().allowCellularDownloads);
        activateReadyLocalModel(installedModelIds, readySystemModelIds, get().jobs);
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
          if (get().jobs[model.id]?.status !== 'downloading') return;
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

        const wifiOnly = !get().allowCellularDownloads;

        try {
          if (preset) {
            await tier2LoadModel(preset, reportProgress, {
              ensureDownloadAllowed: () =>
                assertDownloadAllowed({
                  wifiOnly,
                  requiredBytes: model.fileSizeBytes ?? catalogModel?.fileSizeBytes ?? 0,
                }),
            });
            const record = installedRecordFor(model);
            await recordInstalledModel(record);
          } else {
            await installGgufModel(catalogModel!, reportProgress, wifiOnly);
          }

          set((state) => ({
            installedModelIds: Array.from(new Set([...state.installedModelIds, model.id])),
            jobs: { ...state.jobs, [model.id]: { status: 'ready', progress: 1 } },
          }));
        } catch (err) {
          console.error(`[installStore] prepareModel(${model.id}) failed:`, err);
          // A cancelled download is not an install: clear the job so the row
          // offers Download again, and still reject so no caller selects it.
          if (downloadFailureKind(err) === 'cancelled') {
            set((state) => {
              const { [model.id]: _removed, ...rest } = state.jobs;
              return { jobs: rest };
            });
            throw err;
          }
          set((state) => ({
            jobs: {
              ...state.jobs,
              [model.id]: {
                status: 'failed',
                progress: 0,
                error: installFailureMessage(err),
              },
            },
          }));
          throw err;
        }
      },

      cancelModelDownload: (modelId) => {
        if (get().jobs[modelId]?.status !== 'downloading') return;
        cancelDownload(modelId);
        set((state) => {
          const { [modelId]: _removed, ...rest } = state.jobs;
          return { jobs: rest };
        });
      },

      forgetInstalledModel: (modelId) => {
        set((state) => {
          const { [modelId]: _removed, ...rest } = state.jobs;
          return {
            installedModelIds: state.installedModelIds.filter((id) => id !== modelId),
            jobs: rest,
          };
        });
        activateReadyLocalModel(get().installedModelIds, get().readySystemModelIds, get().jobs);
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
    }),
    {
      name: 'agi-model-install-v1',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({ allowCellularDownloads: state.allowCellularDownloads }),
      onRehydrateStorage: () => (state) => {
        if (state) pushCellularConsentToNative(state.allowCellularDownloads);
      },
    },
  ),
);

rehydrateWhenMmkvReady(useModelInstallStore, 'model-install');

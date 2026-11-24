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
  refreshCapabilities,
  tier2LoadModel,
  type DeviceCapabilities,
} from '@agiworkforce/local-llm';
import type { ExecutorchPreset, OnDeviceModel } from '@agiworkforce/types';
import {
  cancelExecutorchPresetDownload,
  deleteExecutorchPresetFiles,
  liveInstalledModels,
  releaseExecutorchPreset,
} from '@/services/executorchModels';
import {
  assertDownloadAllowed,
  cancelDownload,
  downloadModel,
  excludeModelFilesFromBackup,
  ModelDownloadError,
} from '@/services/modelDownload';
import type { ModelDownloadErrorKind } from '@/services/modelDownload';
import { mmkvStorage, rehydrateWhenMmkvReady } from '@/lib/mmkv';
import {
  getInstalledModel,
  listInstalledModels,
  recordInstalledModel,
} from '@/storage/installedModels';
import type { InstalledModel } from '@/storage/types';
import {
  DEFAULT_LOCAL_MODEL_ID,
  getSelectableModelById,
  isAutoMode,
  isCloudManagedModelId,
} from './service';
import type { ModelDef } from './service';
import { useModelStore } from './store';
import {
  isTemporarySystemModelState,
  platformSystemModelId,
  readSystemModelNativeStatus,
  settleSystemModelState,
  systemModelState,
  systemModelUnavailableNote,
  useSystemModelSession,
  type UnusableSystemModelState,
} from './systemModelAvailability';

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

const installAttempts = new Map<string, symbol>();
const installPresets = new Map<string, ExecutorchPreset>();

export interface ModelInstallObserver {
  onProgress?: (downloaded: number, total: number, speedBps: number) => void;
}

export interface ModelInstallJob {
  status: ModelInstallStatus;
  progress: number;
  error?: string;
  cancellable?: boolean;
}

interface ModelInstallState {
  installedModelIds: string[];
  readySystemModelIds: string[];
  systemModelStates: Record<string, UnusableSystemModelState>;
  totalRAMMB: number | null;
  tier2Available: boolean | null;
  allowCellularDownloads: boolean;
  jobs: Record<string, ModelInstallJob>;
  setAllowCellularDownloads: (allowed: boolean) => void;
  hydrateInstalledModels: () => Promise<void>;
  prepareModel: (model: ModelDef, observer?: ModelInstallObserver) => Promise<void>;
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
const EXECUTORCH_UNAVAILABLE = 'This device cannot run this on-device model.';

function executorchDeviceLock(
  model: ModelDef,
  tier2Available: boolean | null,
): ModelInstallJob | null {
  if (tier2Available !== false) return null;
  const preset = model.executorchPreset ?? getCatalogModelById(model.id)?.executorchPreset;
  return preset ? { status: 'unavailable', progress: 0, error: EXECUTORCH_UNAVAILABLE } : null;
}

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

const SYSTEM_MODEL_NOT_CHECKED = 'This system model is not available on this device yet.';

function systemModelNote(
  model: ModelDef,
  systemModelStates: Record<string, UnusableSystemModelState>,
): string {
  const state = systemModelStates[model.id];
  return state ? systemModelUnavailableNote(state, model.name) : SYSTEM_MODEL_NOT_CHECKED;
}

function defaultStatusForModel(
  model: ModelDef,
  installedModelIds: string[],
  readySystemModelIds: string[],
  systemModelStates: Record<string, UnusableSystemModelState>,
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
      error: systemModelNote(model, systemModelStates),
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
  observeBytes?: ModelInstallObserver['onProgress'],
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
    onProgress: (downloaded, total, speedBps) => {
      onProgress(total > 0 ? downloaded / total : 0);
      observeBytes?.(downloaded, total, speedBps);
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

type LocalReadiness = Pick<
  ModelInstallState,
  'installedModelIds' | 'readySystemModelIds' | 'systemModelStates' | 'jobs'
>;

// A system model that was checked and cannot answer is not on this device in
// any useful sense, so it gives way even when nothing else is ready.
function readyLocalReplacement(modelId: string, readiness: LocalReadiness): string | null {
  return (
    pickReadyLocalModelId(
      modelId,
      readiness.installedModelIds,
      readiness.readySystemModelIds,
      readiness.jobs[modelId]?.status === 'downloading',
    ) ?? (readiness.systemModelStates[modelId] ? DEFAULT_LOCAL_MODEL_ID : null)
  );
}

// Resolve the local model to run now: the given id when it is on disk, else a
// ready one.
export function readyLocalModelIdOr(fallbackModelId: string): string {
  return readyLocalReplacement(fallbackModelId, useModelInstallStore.getState()) ?? fallbackModelId;
}

// A system model that is only turned off or still preparing stays the person's
// choice for new chats; this chat moves to a model that can answer now.
function moveOffLocalModel(modelId: string, readiness: LocalReadiness): void {
  const replacement = readyLocalReplacement(modelId, readiness);
  if (!replacement) return;
  const models = useModelStore.getState();
  const remembered = models.newChatModels.local;
  models.setModel(replacement);
  const state = readiness.systemModelStates[modelId];
  if (state && isTemporarySystemModelState(state) && remembered === modelId) {
    useModelStore.setState((current) => ({
      newChatModels: { ...current.newChatModels, local: modelId },
    }));
  }
}

function activateReadyLocalModel(readiness: LocalReadiness): void {
  moveOffLocalModel(useModelStore.getState().selectedModel, readiness);
}

// Subscribed on first use, not at import: the model store's own imports reach
// this module before that store exists.
let followingLocalModelSelection = false;

function followLocalModelSelection(): void {
  if (followingLocalModelSelection) return;
  followingLocalModelSelection = true;
  useModelStore.subscribe((state, previous) => {
    if (state.selectedModel === previous.selectedModel || state.conversationModelShown) return;
    const readiness = useModelInstallStore.getState();
    if (readiness.systemModelStates[state.selectedModel]) {
      moveOffLocalModel(state.selectedModel, readiness);
    }
  });
}

async function systemModelStatesFor(cachedCaps: DeviceCapabilities | null): Promise<{
  caps: DeviceCapabilities | null;
  states: Record<string, UnusableSystemModelState>;
}> {
  const modelId = platformSystemModelId();
  const model = modelId ? getSelectableModelById(modelId) : undefined;
  if (!model) return { caps: cachedCaps, states: {} };
  let caps = cachedCaps;
  try {
    caps = await refreshCapabilities();
  } catch {
    caps = cachedCaps;
  }
  const checked =
    systemModelState(model.id, caps, null) === 'ready'
      ? 'ready'
      : systemModelState(model.id, caps, await readSystemModelNativeStatus());
  const state = settleSystemModelState(model.id, checked);
  return { caps, states: state === 'ready' ? {} : { [model.id]: state } };
}

function withdrawFailedSystemModel(modelId: string): void {
  const model = getSelectableModelById(modelId);
  if (!model) return;
  followLocalModelSelection();
  useModelInstallStore.setState((state) => {
    const { [modelId]: _removed, ...jobs } = state.jobs;
    return {
      installedModelIds: state.installedModelIds.filter((id) => id !== modelId),
      readySystemModelIds: state.readySystemModelIds.filter((id) => id !== modelId),
      systemModelStates: { ...state.systemModelStates, [modelId]: 'failed' },
      jobs,
    };
  });
  const models = useModelStore.getState();
  const replacement = readyLocalReplacement(modelId, useModelInstallStore.getState());
  if (!replacement) return;
  if (models.selectedModel === modelId && !models.conversationModelShown) {
    models.setModel(replacement);
    return;
  }
  if (models.newChatModels.local === modelId) {
    useModelStore.setState({ newChatModels: { ...models.newChatModels, local: replacement } });
  }
}

export const useModelInstallStore = create<ModelInstallState>()(
  persist(
    (set, get) => ({
      installedModelIds: [],
      readySystemModelIds: [],
      systemModelStates: {},
      totalRAMMB: null,
      tier2Available: null,
      allowCellularDownloads: false,
      jobs: {},

      setAllowCellularDownloads: (allowed) => {
        set({ allowCellularDownloads: allowed });
        pushCellularConsentToNative(allowed);
      },

      hydrateInstalledModels: async () => {
        followLocalModelSelection();
        void excludeModelFilesFromBackup();
        const [recorded, cachedCaps] = await Promise.all([
          listInstalledModels().catch(() => []),
          getCapabilities().catch(() => null),
        ]);
        const installed = await liveInstalledModels(recorded).catch(() => recorded);
        const { caps, states: systemModelStates } = await systemModelStatesFor(cachedCaps);
        const systemModel = getSystemModelForTier1Runtime(caps?.tier1Runtime ?? null);
        const readySystemModelIds =
          systemModel && !systemModelStates[systemModel.id] ? [systemModel.id] : [];
        const installedModelIds = installed
          .filter((model) => caps?.tier2Available !== false || model.format !== 'pte')
          .map((model) => model.id);
        set((state) => {
          const jobs = { ...state.jobs };
          for (const modelId of Object.keys(systemModelStates)) delete jobs[modelId];
          for (const modelId of readySystemModelIds) delete jobs[modelId];
          return {
            installedModelIds,
            readySystemModelIds,
            systemModelStates,
            jobs,
            totalRAMMB: caps?.totalRAMMB ?? null,
            tier2Available: caps?.tier2Available ?? null,
          };
        });
        pushCellularConsentToNative(get().allowCellularDownloads);
        activateReadyLocalModel(get());
      },

      prepareModel: async (model, observer) => {
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
            const error = systemModelNote(model, get().systemModelStates);
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

        const catalogModel = getCatalogModelById(model.id);
        const preset = model.executorchPreset ?? catalogModel?.executorchPreset;
        if (preset) {
          const caps = await getCapabilities().catch(() => null);
          const tier2Available = caps?.tier2Available ?? get().tier2Available;
          set({ tier2Available });
          if (executorchDeviceLock(model, tier2Available)) {
            throw new Error(EXECUTORCH_UNAVAILABLE);
          }
        }

        const recordedModel = await getInstalledModel(model.id).catch(() => null);
        const existing = recordedModel
          ? ((await liveInstalledModels([recordedModel]).catch(() => [recordedModel]))[0] ?? null)
          : null;
        if (existing) {
          set((state) => ({
            installedModelIds: Array.from(new Set([...state.installedModelIds, model.id])),
            jobs: { ...state.jobs, [model.id]: { status: 'ready', progress: 1 } },
          }));
          return;
        }

        const ggufInstallable = !preset && catalogModel && hasRunnableGgufArtifacts(catalogModel);
        if (!preset && !ggufInstallable) {
          const error = 'The native package for this model is not bundled yet.';
          set((state) => ({
            jobs: { ...state.jobs, [model.id]: { status: 'unavailable', progress: 0, error } },
          }));
          throw new Error(error);
        }

        const inFlight = get().jobs[model.id]?.status === 'downloading';
        const attempt = (inFlight && installAttempts.get(model.id)) || Symbol(model.id);
        installAttempts.set(model.id, attempt);
        if (preset) installPresets.set(model.id, preset);
        const ownsJob = (): boolean => installAttempts.get(model.id) === attempt;
        set((state) => ({
          jobs: {
            ...state.jobs,
            [model.id]: { status: 'downloading', progress: 0.01, cancellable: true },
          },
        }));

        const reportProgress = (progress: number): void => {
          if (!ownsJob() || get().jobs[model.id]?.status !== 'downloading') return;
          set((state) => ({
            jobs: {
              ...state.jobs,
              [model.id]: {
                status: 'downloading',
                progress: Math.max(0.01, clampProgress(progress)),
                cancellable: true,
              },
            },
          }));
        };

        const wifiOnly = !get().allowCellularDownloads;

        try {
          if (preset) {
            try {
              await tier2LoadModel(preset, reportProgress, {
                ensureDownloadAllowed: async () => {
                  await assertDownloadAllowed({
                    wifiOnly,
                    requiredBytes: model.fileSizeBytes ?? catalogModel?.fileSizeBytes ?? 0,
                  });
                  if (!ownsJob())
                    throw new ModelDownloadError('cancelled', 'Download was cancelled.');
                },
              });
            } catch (error) {
              if (ownsJob()) throw error;
              await deleteExecutorchPresetFiles(preset).catch(() => undefined);
              throw new ModelDownloadError('cancelled', 'Download was cancelled.');
            }
            if (!ownsJob()) {
              try {
                releaseExecutorchPreset(preset);
              } catch {
                // A reply is already running on the loaded model, so it cannot be released yet.
              }
              await deleteExecutorchPresetFiles(preset).catch(() => undefined);
              throw new ModelDownloadError('cancelled', 'Download was cancelled.');
            }
            await excludeModelFilesFromBackup();
            await recordInstalledModel(installedRecordFor(model));
          } else {
            await installGgufModel(
              catalogModel!,
              reportProgress,
              wifiOnly,
              observer?.onProgress &&
                ((downloaded, total, speedBps) => {
                  if (ownsJob()) observer.onProgress?.(downloaded, total, speedBps);
                }),
            );
          }

          if (!ownsJob()) {
            throw new ModelDownloadError('cancelled', 'Download was cancelled.');
          }
          set((state) => ({
            installedModelIds: Array.from(new Set([...state.installedModelIds, model.id])),
            jobs: { ...state.jobs, [model.id]: { status: 'ready', progress: 1 } },
          }));
        } catch (err) {
          if (!ownsJob()) throw err;
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
        const job = get().jobs[modelId];
        if (job?.status !== 'downloading' || !job.cancellable) return;
        const preset = installPresets.get(modelId);
        if (preset) {
          void cancelExecutorchPresetDownload(preset);
        } else {
          cancelDownload(modelId);
        }
        installAttempts.delete(modelId);
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
        activateReadyLocalModel(get());
      },

      statusForModel: (model) => {
        return (
          executorchDeviceLock(model, get().tier2Available) ??
          get().jobs[model.id] ??
          defaultStatusForModel(
            model,
            get().installedModelIds,
            get().readySystemModelIds,
            get().systemModelStates,
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

useSystemModelSession.subscribe((state, previous) => {
  for (const modelId of state.failedModelIds) {
    if (!previous.failedModelIds.includes(modelId)) withdrawFailedSystemModel(modelId);
  }
});

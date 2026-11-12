import {
  getLiteModeModel,
  loadedLocalModel,
  tier2IsPresetDownloaded,
  tier2LoadModel,
  tier2Release,
} from '@agiworkforce/local-llm';
import {
  _setExecutorchResourcesForTesting,
  executorchPresetSources,
  liveInstalledModels,
} from '@/services/executorchModels';
import {
  deleteDownloadedModel,
  ModelDownloadError,
  modelRemovalUnsupportedReason,
} from '@/services/modelDownload';
import {
  deleteInstalledModel,
  getInstalledModel,
  listInstalledModels,
  recordInstalledModel,
  removeInstalledModel,
} from '@/storage/installedModels';
import type { InstalledModel } from '@/storage/types';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import { resolveLocalModelRef } from '@/src/features/model-picker/localModelRuntime';
import type { ModelDef } from '@/src/features/model-picker/service';

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'file:///documents/',
  makeDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  createDownloadResumable: jest.fn(),
  getFreeDiskStorageAsync: jest.fn(),
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
}));

jest.mock('@/storage/installedModels', () => ({
  getInstalledModel: jest.fn(),
  listInstalledModels: jest.fn(),
  recordInstalledModel: jest.fn(),
  insertInstalledModel: jest.fn(),
  removeInstalledModel: jest.fn(),
  deleteInstalledModel: jest.fn(),
  markInstalledModelUsed: jest.fn(),
}));

jest.mock('@agiworkforce/local-llm', () => ({
  ...jest.requireActual('@agiworkforce/local-llm'),
  tier2LoadModel: jest.fn(),
  tier2IsPresetDownloaded: jest.fn(),
  tier2Release: jest.fn(),
  loadedLocalModel: jest.fn().mockReturnValue(null),
  getCapabilities: jest.fn().mockResolvedValue({
    totalRAMMB: 8192,
    osVersion: '17.0',
    thermalThrottled: false,
    tier1Available: false,
    tier1Runtime: null,
    tier1Status: 'unavailable',
    tier2Available: true,
    tier3Available: true,
  }),
}));

const CATALOG_MODEL = getLiteModeModel()!;
const PRESET = CATALOG_MODEL.executorchPreset!;
const SOURCES = executorchPresetSources(PRESET);

const filenameFor = (source: string): string =>
  source.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9._-]/g, '_');

let files: Set<string>;
const cancelFetching = jest.fn<Promise<void>, string[]>();
const deleteResources = jest.fn<Promise<void>, string[]>();

function installResources(): void {
  _setExecutorchResourcesForTesting({
    deleteResources: async (...sources) => {
      await deleteResources(...sources);
      sources.forEach((source) => files.delete(filenameFor(source)));
    },
    cancelFetching: (...sources) => cancelFetching(...sources),
  });
}

function putPresetFiles(): void {
  SOURCES.forEach((source) => files.add(filenameFor(source)));
}

function pteRecord(overrides: Partial<InstalledModel> = {}): InstalledModel {
  return {
    id: CATALOG_MODEL.id,
    display_name: CATALOG_MODEL.displayName,
    runtime: 'local',
    format: 'pte',
    size_bytes: CATALOG_MODEL.fileSizeBytes,
    sha256: null,
    local_path: null,
    installed_at: 1,
    last_used_at: null,
    capabilities: JSON.stringify({ managedBy: 'react-native-executorch' }),
    ...overrides,
  };
}

const MODEL_DEF: ModelDef = {
  id: CATALOG_MODEL.id,
  name: CATALOG_MODEL.displayName,
  provider: 'local',
  providerLabel: 'On device',
  contextWindow: 4096,
  maxOutput: 1024,
  supportsVision: false,
  supportsThinking: false,
  tier: 'economy',
  surface: 'local',
  availability: 'download_required',
  runtimeLabel: 'ExecuTorch',
  detailLabel: 'ExecuTorch',
  fileSizeBytes: CATALOG_MODEL.fileSizeBytes,
  license: 'Apache-2.0',
  executorchPreset: PRESET,
};

const flush = async (): Promise<void> => {
  for (let tick = 0; tick < 10; tick += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  files = new Set();
  cancelFetching.mockResolvedValue(undefined);
  deleteResources.mockResolvedValue(undefined);
  installResources();
  (tier2IsPresetDownloaded as jest.Mock).mockImplementation(async (preset: typeof PRESET) =>
    executorchPresetSources(preset).every((source) => files.has(filenameFor(source))),
  );
  (loadedLocalModel as jest.Mock).mockReturnValue(null);
  (listInstalledModels as jest.Mock).mockResolvedValue([]);
  (getInstalledModel as jest.Mock).mockResolvedValue(null);
  (removeInstalledModel as jest.Mock).mockResolvedValue(undefined);
  (deleteInstalledModel as jest.Mock).mockResolvedValue(undefined);
  (recordInstalledModel as jest.Mock).mockResolvedValue(undefined);
  useModelInstallStore.setState({
    installedModelIds: [],
    readySystemModelIds: [],
    totalRAMMB: 8192,
    allowCellularDownloads: false,
    jobs: {},
  });
});

afterAll(() => {
  _setExecutorchResourcesForTesting(null);
});

describe('stale installed records are dropped', () => {
  it('removes a pte record whose files are gone and keeps one whose files exist', async () => {
    await expect(liveInstalledModels([pteRecord()])).resolves.toEqual([]);
    expect(removeInstalledModel).toHaveBeenCalledWith(CATALOG_MODEL.id);

    jest.clearAllMocks();
    putPresetFiles();
    await expect(liveInstalledModels([pteRecord()])).resolves.toEqual([pteRecord()]);
    expect(removeInstalledModel).not.toHaveBeenCalled();
  });

  it('leaves GGUF records alone', async () => {
    const gguf = pteRecord({ format: 'gguf', local_path: 'file:///documents/models/x/model.gguf' });
    await expect(liveInstalledModels([gguf])).resolves.toEqual([gguf]);
    expect(removeInstalledModel).not.toHaveBeenCalled();
  });

  it('hydration offers Download again for a record whose files are gone', async () => {
    (listInstalledModels as jest.Mock).mockResolvedValue([pteRecord()]);
    await useModelInstallStore.getState().hydrateInstalledModels();
    expect(useModelInstallStore.getState().installedModelIds).toEqual([]);
    expect(removeInstalledModel).toHaveBeenCalledWith(CATALOG_MODEL.id);
    expect(useModelInstallStore.getState().statusForModel(MODEL_DEF).status).toBe(
      'download_required',
    );
  });

  it('hydration keeps a record whose files are present', async () => {
    putPresetFiles();
    (listInstalledModels as jest.Mock).mockResolvedValue([pteRecord()]);
    await useModelInstallStore.getState().hydrateInstalledModels();
    expect(useModelInstallStore.getState().installedModelIds).toEqual([CATALOG_MODEL.id]);
  });

  it('chat refuses a stale record instead of treating the model as installed', async () => {
    (listInstalledModels as jest.Mock).mockResolvedValue([pteRecord()]);
    (getInstalledModel as jest.Mock).mockResolvedValue(pteRecord());
    await expect(resolveLocalModelRef(CATALOG_MODEL.id)).rejects.toThrow(/not downloaded yet/i);

    putPresetFiles();
    await expect(resolveLocalModelRef(CATALOG_MODEL.id)).resolves.toMatchObject({
      modelId: CATALOG_MODEL.id,
      installed: true,
    });
  });
});

describe('an ExecuTorch download can be cancelled', () => {
  it('stops every source, clears the job and records nothing', async () => {
    let interrupt: (error: Error) => void = () => undefined;
    (tier2LoadModel as jest.Mock).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          interrupt = reject;
        }),
    );
    cancelFetching.mockImplementation(async () => {
      interrupt(new Error('Download was canceled.'));
    });

    const install = useModelInstallStore.getState().prepareModel(MODEL_DEF);
    const outcome = install.catch((error: unknown) => error);
    await flush();
    expect(useModelInstallStore.getState().jobs[MODEL_DEF.id]).toMatchObject({
      status: 'downloading',
      cancellable: true,
    });

    useModelInstallStore.getState().cancelModelDownload(MODEL_DEF.id);
    expect(await outcome).toBeInstanceOf(ModelDownloadError);
    expect(await outcome).toMatchObject({ kind: 'cancelled' });

    SOURCES.forEach((source) => expect(cancelFetching).toHaveBeenCalledWith(source));
    expect(deleteResources).toHaveBeenCalledWith(...SOURCES);
    expect(recordInstalledModel).not.toHaveBeenCalled();
    const state = useModelInstallStore.getState();
    expect(state.jobs[MODEL_DEF.id]).toBeUndefined();
    expect(state.installedModelIds).not.toContain(MODEL_DEF.id);
  });

  it('removes the files and records nothing when the load finishes after the cancel', async () => {
    let finish: () => void = () => undefined;
    (tier2LoadModel as jest.Mock).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    cancelFetching.mockRejectedValue(new Error('None of given sources are currently downloading.'));

    const install = useModelInstallStore.getState().prepareModel(MODEL_DEF);
    const outcome = install.catch((error: unknown) => error);
    await flush();
    useModelInstallStore.getState().cancelModelDownload(MODEL_DEF.id);
    putPresetFiles();
    (loadedLocalModel as jest.Mock).mockReturnValue({
      runtime: 'executorch',
      preset: PRESET.modelName,
    });
    finish();

    expect(await outcome).toMatchObject({ kind: 'cancelled' });
    expect(tier2Release).toHaveBeenCalled();
    expect(deleteResources).toHaveBeenCalledWith(...SOURCES);
    expect(files.size).toBe(0);
    expect(recordInstalledModel).not.toHaveBeenCalled();
    expect(useModelInstallStore.getState().jobs[MODEL_DEF.id]).toBeUndefined();
  });

  it('stops the download at the consent gate once it was cancelled', async () => {
    let gate: (() => Promise<void>) | undefined;
    let release: () => void = () => undefined;
    (tier2LoadModel as jest.Mock).mockImplementation(
      async (
        _preset: unknown,
        _progress: unknown,
        options?: { ensureDownloadAllowed?: () => Promise<void> },
      ) => {
        gate = options?.ensureDownloadAllowed;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await gate?.();
      },
    );
    const install = useModelInstallStore.getState().prepareModel(MODEL_DEF);
    const outcome = install.catch((error: unknown) => error);
    await flush();
    useModelInstallStore.getState().cancelModelDownload(MODEL_DEF.id);
    release();

    expect(await outcome).toMatchObject({ kind: 'cancelled' });
    expect(recordInstalledModel).not.toHaveBeenCalled();
  });
});

describe('an ExecuTorch model can be removed', () => {
  it('is removable when its record is managed by ExecuTorch and the catalog knows its files', () => {
    expect(modelRemovalUnsupportedReason(pteRecord())).toBeNull();
  });

  it.each([
    { capabilities: null },
    { capabilities: JSON.stringify({ managedBy: 'llama.rn' }) },
    { id: 'not-in-the-catalog' },
    { local_path: 'file:///documents/models/x/model.pte' },
  ])('stays unsupported for %j', (overrides) => {
    expect(modelRemovalUnsupportedReason(pteRecord(overrides))).toMatch(
      /does not have a supported file-removal method/,
    );
  });

  it('deletes the files and the record without unloading a model that is not loaded', async () => {
    putPresetFiles();
    (getInstalledModel as jest.Mock).mockResolvedValue(pteRecord());

    await deleteDownloadedModel(pteRecord());

    expect(tier2Release).not.toHaveBeenCalled();
    expect(deleteResources).toHaveBeenCalledWith(...SOURCES);
    expect(files.size).toBe(0);
    expect(deleteInstalledModel).toHaveBeenCalledWith(CATALOG_MODEL.id);
  });

  it('does not unload a different loaded model', async () => {
    (loadedLocalModel as jest.Mock).mockReturnValue({
      runtime: 'executorch',
      preset: 'another-preset',
    });
    (getInstalledModel as jest.Mock).mockResolvedValue(pteRecord());

    await deleteDownloadedModel(pteRecord());

    expect(tier2Release).not.toHaveBeenCalled();
    expect(deleteResources).toHaveBeenCalled();
  });

  it('unloads the model first when it is the loaded one', async () => {
    (loadedLocalModel as jest.Mock).mockReturnValue({
      runtime: 'executorch',
      preset: PRESET.modelName,
    });
    (getInstalledModel as jest.Mock).mockResolvedValue(pteRecord());
    const order: string[] = [];
    (tier2Release as jest.Mock).mockImplementation(() => order.push('release'));
    deleteResources.mockImplementation(async () => {
      order.push('delete');
    });

    await deleteDownloadedModel(pteRecord());

    expect(order).toEqual(['release', 'delete']);
    expect(deleteInstalledModel).toHaveBeenCalledWith(CATALOG_MODEL.id);
  });

  it('refuses with a clear message and keeps everything while a reply is running', async () => {
    (loadedLocalModel as jest.Mock).mockReturnValue({
      runtime: 'executorch',
      preset: PRESET.modelName,
    });
    (getInstalledModel as jest.Mock).mockResolvedValue(pteRecord());
    (tier2Release as jest.Mock).mockImplementation(() => {
      throw new Error('ExecuTorch is busy.');
    });

    await expect(deleteDownloadedModel(pteRecord())).rejects.toMatchObject({
      name: 'ModelRemovalError',
      message: 'This model is replying now. Try again when it finishes.',
    });
    expect(deleteResources).not.toHaveBeenCalled();
    expect(deleteInstalledModel).not.toHaveBeenCalled();
  });

  it('refuses when the installed record changed since Storage was read', async () => {
    (getInstalledModel as jest.Mock).mockResolvedValue(pteRecord({ installed_at: 2 }));
    await expect(deleteDownloadedModel(pteRecord())).rejects.toThrow(/installed model changed/);
    expect(deleteResources).not.toHaveBeenCalled();
  });

  it('keeps the record when the files cannot be deleted so removal can be retried', async () => {
    (getInstalledModel as jest.Mock).mockResolvedValue(pteRecord());
    deleteResources.mockRejectedValue(new Error('disk error'));
    await expect(deleteDownloadedModel(pteRecord())).rejects.toThrow('disk error');
    expect(deleteInstalledModel).not.toHaveBeenCalled();
  });
});

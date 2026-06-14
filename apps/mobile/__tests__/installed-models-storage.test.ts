import type { InstalledModel } from '../storage/types';
import {
  getInstalledModel,
  listInstalledModels,
  markInstalledModelUsed,
  recordInstalledModel,
  removeInstalledModel,
} from '../storage/installedModels';

const mockDb = {
  runAsync: jest.fn(),
  getAllAsync: jest.fn(),
  getFirstAsync: jest.fn(),
};

jest.mock('../storage/db', () => ({
  getDb: jest.fn(async () => mockDb),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.runAsync.mockResolvedValue({ changes: 1, lastInsertRowId: 0 });
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue(null);
});

function installedModel(): InstalledModel {
  return {
    id: 'qwen3-4b',
    display_name: 'AGI Standard',
    runtime: 'local',
    format: 'gguf',
    size_bytes: 1234,
    sha256: 'a'.repeat(64),
    local_path: 'file:///models/qwen3-4b/model.gguf',
    installed_at: 1_790_000_000_000,
    last_used_at: null,
    capabilities: '{"text":true}',
  };
}

describe('installed model storage repository', () => {
  it('records installed model metadata in SQLCipher storage', async () => {
    await recordInstalledModel(installedModel());

    expect(mockDb.runAsync).toHaveBeenCalledWith(expect.stringContaining('installed_models'), [
      'qwen3-4b',
      'AGI Standard',
      'local',
      'gguf',
      1234,
      'a'.repeat(64),
      'file:///models/qwen3-4b/model.gguf',
      1_790_000_000_000,
      null,
      '{"text":true}',
    ]);
  });

  it('maps fetched rows to InstalledModel', async () => {
    mockDb.getFirstAsync.mockResolvedValue({
      id: 'qwen3-4b',
      display_name: 'AGI Standard',
      runtime: 'local',
      format: 'gguf',
      size_bytes: 1234,
      sha256: 'a'.repeat(64),
      local_path: 'file:///models/qwen3-4b/model.gguf',
      installed_at: 1,
      last_used_at: 2,
      capabilities: null,
    });

    await expect(getInstalledModel('qwen3-4b')).resolves.toEqual({
      ...installedModel(),
      installed_at: 1,
      last_used_at: 2,
      capabilities: null,
    });
  });

  it('lists installed models from the database', async () => {
    mockDb.getAllAsync.mockResolvedValue([
      {
        id: 'model-a',
        display_name: 'Model A',
        runtime: 'local',
        format: 'pte',
        size_bytes: 10,
        sha256: null,
        local_path: null,
        installed_at: 1,
        last_used_at: null,
        capabilities: null,
      },
    ]);

    const rows = await listInstalledModels();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.format).toBe('pte');
  });

  it('ignores malformed installed model rows instead of leaking bad local state', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockDb.getAllAsync.mockResolvedValue([
      {
        id: 'model-a',
        display_name: 'Model A',
        runtime: 'local',
        format: 'pte',
        size_bytes: 10,
        sha256: null,
        local_path: null,
        installed_at: 1,
        last_used_at: null,
        capabilities: null,
      },
      {
        id: 'broken-model',
        display_name: 'Broken Model',
        runtime: 'local',
        format: 'pte',
        size_bytes: null,
        sha256: null,
        local_path: null,
        installed_at: 1,
        last_used_at: null,
        capabilities: null,
      },
    ]);

    const rows = await listInstalledModels();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('model-a');
    expect(warnSpy).toHaveBeenCalledWith(
      '[installedModels] Ignoring malformed installed model row:',
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it('returns null when a fetched installed model row is malformed', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockDb.getFirstAsync.mockResolvedValue({
      id: 'broken-model',
      display_name: 'Broken Model',
      runtime: 'unsupported-runtime',
      format: 'pte',
      size_bytes: 10,
      sha256: null,
      local_path: null,
      installed_at: 1,
      last_used_at: null,
      capabilities: null,
    });

    await expect(getInstalledModel('broken-model')).resolves.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      '[installedModels] Ignoring malformed installed model row:',
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it('removes installed model metadata by id', async () => {
    await removeInstalledModel('qwen3-4b');

    expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM installed_models WHERE id = ?;', [
      'qwen3-4b',
    ]);
  });

  it('updates last_used_at for a model after local inference', async () => {
    await markInstalledModelUsed('qwen3-4b', 1_800_000_000_000);

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'UPDATE installed_models SET last_used_at = ? WHERE id = ?;',
      [1_800_000_000_000, 'qwen3-4b'],
    );
  });
});

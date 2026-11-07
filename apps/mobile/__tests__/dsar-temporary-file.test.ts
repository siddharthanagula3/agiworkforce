const mockUuid = jest.fn();
const mockInfo = jest.fn();
const mockMkdir = jest.fn();
const mockDelete = jest.fn();
jest.mock('expo-crypto', () => ({ randomUUID: () => mockUuid() }));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: (...args: unknown[]) => mockInfo(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMkdir(...args),
  deleteAsync: (...args: unknown[]) => mockDelete(...args),
}));
import { withDsarTemporaryFile } from '../services/dsarTemporaryFile';

describe('DSAR temporary file ownership', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockUuid.mockReturnValue('operation-a');
    mockInfo.mockResolvedValue({ exists: false });
    mockMkdir.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);
  });

  it('cleans its own directory after a partial write without hiding the original error', async () => {
    mockDelete.mockRejectedValue(new Error('cleanup failure'));
    await expect(withDsarTemporaryFile('agi_data_export.json', () => {}, async () => {
      throw new Error('write failure');
    })).rejects.toThrow('write failure');
    expect(mockDelete).toHaveBeenCalledWith('file:///cache/dsar_exports/operation-a/', { idempotent: true });
  });

  it('does not delete a colliding or uncertain allocation', async () => {
    mockInfo.mockResolvedValue({ exists: true });
    await expect(withDsarTemporaryFile('agi_data_export.json', () => {}, jest.fn())).rejects.toThrow('allocate');
    expect(mockDelete).not.toHaveBeenCalled();
    mockInfo.mockResolvedValue({ exists: false });
    mockMkdir.mockImplementation(async (uri: string) => {
      if (uri.endsWith('operation-a/')) throw new Error('uncertain allocation');
    });
    await expect(withDsarTemporaryFile('agi_data_export.json', () => {}, jest.fn())).rejects.toThrow('uncertain');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('rejects a reused active id and does not disturb the first export', async () => {
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const first = withDsarTemporaryFile('agi_data_export.json', () => {}, async () => {
      enter();
      await hold;
    });
    await entered;
    await expect(withDsarTemporaryFile('agi_data_export.json', () => {}, jest.fn())).rejects.toThrow('allocate');
    expect(mockDelete).not.toHaveBeenCalled();
    release();
    await first;
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
  it('gives concurrent exports distinct paths and cleans only the completed operation', async () => {
    mockUuid.mockReturnValueOnce('operation-a').mockReturnValueOnce('operation-b');
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const pending = new Promise<void>((resolve) => { release = resolve; });
    let firstUri = '';
    const first = withDsarTemporaryFile('agi_data_export.json', () => {}, async (uri) => {
      firstUri = uri;
      entered();
      await pending;
    });
    await started;
    let secondUri = '';
    await withDsarTemporaryFile('agi_data_export.json', () => {}, async (uri) => { secondUri = uri; });
    expect(firstUri).not.toBe(secondUri);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith('file:///cache/dsar_exports/operation-b/', { idempotent: true });
    release();
    await first;
    expect(mockDelete).toHaveBeenCalledTimes(2);
  });

});

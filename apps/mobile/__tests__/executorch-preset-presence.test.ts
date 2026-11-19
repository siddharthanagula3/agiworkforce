import { getLiteModeModel, tier2IsPresetDownloaded } from '@agiworkforce/local-llm';

const filenameFor = (source: string): string =>
  source.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9._-]/g, '_');

const mockAdapter: { listDownloadedFiles?: () => Promise<string[]> } = {};

jest.mock('react-native-executorch/legacy', () => ({
  ResourceFetcher: { getAdapter: () => mockAdapter },
  ResourceFetcherUtils: {
    getFilenameFromUri: (source: string) =>
      source.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9._-]/g, '_'),
  },
}));

const PRESET = getLiteModeModel()!.executorchPreset!;
const ALL_SOURCES = [PRESET.modelSource, PRESET.tokenizerSource, PRESET.tokenizerConfigSource];

function listing(names: string[]): () => Promise<string[]> {
  return async () => names.map((name) => `file:///documents/react-native-executorch/${name}`);
}

describe('the ExecuTorch preset presence check reads the fetcher listing', () => {
  it('is downloaded when the model and both tokenizer files are listed', async () => {
    mockAdapter.listDownloadedFiles = listing(ALL_SOURCES.map(filenameFor));
    await expect(tier2IsPresetDownloaded(PRESET)).resolves.toBe(true);
  });

  it('is not downloaded when one file is missing', async () => {
    mockAdapter.listDownloadedFiles = listing(ALL_SOURCES.slice(0, 2).map(filenameFor));
    await expect(tier2IsPresetDownloaded(PRESET)).resolves.toBe(false);
  });

  it('is not downloaded when only another model is listed', async () => {
    mockAdapter.listDownloadedFiles = listing(['huggingface.co_other_model.pte']);
    await expect(tier2IsPresetDownloaded(PRESET)).resolves.toBe(false);
  });

  it('is not downloaded when the listing fails', async () => {
    mockAdapter.listDownloadedFiles = async () => {
      throw new Error('directory missing');
    };
    await expect(tier2IsPresetDownloaded(PRESET)).resolves.toBe(false);
  });

  it('is not downloaded when the fetcher cannot list files', async () => {
    mockAdapter.listDownloadedFiles = undefined;
    await expect(tier2IsPresetDownloaded(PRESET)).resolves.toBe(false);
  });
});

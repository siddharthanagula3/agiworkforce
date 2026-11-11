import { readFileSync } from 'fs';
import { join } from 'path';

const mockDownloadAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();

jest.mock('expo-asset', () => ({
  Asset: { fromModule: () => ({ downloadAsync: () => mockDownloadAsync() }) },
}));
jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: (uri: string) => mockReadAsStringAsync(uri),
}));

function freshRuntime(): typeof import('../mermaidRuntime') {
  let loaded!: typeof import('../mermaidRuntime');
  jest.isolateModules(() => {
    loaded = jest.requireActual<typeof import('../mermaidRuntime')>('../mermaidRuntime');
  });
  return loaded;
}

describe('bundled Mermaid runtime', () => {
  beforeEach(() => {
    mockDownloadAsync.mockReset();
    mockReadAsStringAsync.mockReset();
  });

  it('ships the real Mermaid build inside the app, so diagrams need no network', () => {
    const bundled = readFileSync(
      join(__dirname, '../../../../../assets/vendor/mermaid.min.mermaidjs'),
      'utf8',
    );
    expect(bundled.length).toBeGreaterThan(1_000_000);
    expect(bundled).toContain('mermaid');
    expect(bundled).not.toMatch(/<\/script/i);
  });

  it('reads the asset once and serves every later diagram from memory', async () => {
    mockDownloadAsync.mockResolvedValue({ localUri: 'file:///bundle/mermaid.min.mermaidjs' });
    mockReadAsStringAsync.mockResolvedValue('window.mermaid = {};');
    const { loadMermaidRuntime } = freshRuntime();

    await expect(loadMermaidRuntime()).resolves.toBe('window.mermaid = {};');
    await expect(loadMermaidRuntime()).resolves.toBe('window.mermaid = {};');
    expect(mockReadAsStringAsync).toHaveBeenCalledTimes(1);
    expect(mockReadAsStringAsync).toHaveBeenCalledWith('file:///bundle/mermaid.min.mermaidjs');
  });

  it('tries again after a failed read instead of caching the failure', async () => {
    mockDownloadAsync.mockResolvedValue({ localUri: null });
    const { loadMermaidRuntime } = freshRuntime();
    await expect(loadMermaidRuntime()).rejects.toThrow('not available');

    mockDownloadAsync.mockResolvedValue({ localUri: 'file:///bundle/mermaid.min.mermaidjs' });
    mockReadAsStringAsync.mockResolvedValue('window.mermaid = {};');
    await expect(loadMermaidRuntime()).resolves.toBe('window.mermaid = {};');
  });

  it('keeps a closing script tag inside the runtime from ending the inline script', () => {
    const { inlineScriptSource } = freshRuntime();
    expect(inlineScriptSource('var s = "</script><b>";')).toBe('var s = "<\\/script><b>";');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useCodeStore } from '../codeStore';

vi.mock('@tauri-apps/api/core', () => {
  const savedFiles = new Map<string, string>();
  return {
    invoke: vi.fn(async (command: string, args: Record<string, unknown>) => {
      switch (command) {
        case 'file_read': {
          const path = args['path'] as string;
          return savedFiles.get(path) ?? `contents:${path}`;
        }
        case 'file_write': {
          const path = args['path'] as string;
          const content = args['content'] as string;
          savedFiles.set(path, content);
          return;
        }
        default:
          return;
      }
    }),
  };
});

beforeEach(() => {
  useCodeStore.persist?.clearStorage?.();
  useCodeStore.setState({
    openFiles: [],
    activeFilePath: null,
    rootPath: null,
    persistedOpenPaths: [],
  });
  vi.mocked(invoke).mockClear();
});

describe('codeStore', () => {
  it('opens files and tracks persisted tabs', async () => {
    const store = useCodeStore.getState();

    await store.openFile('C:/project/src/main.ts');
    await store.openFile('C:/project/src/utils.ts');

    const state = useCodeStore.getState();
    expect(state.openFiles.length).toBe(2);
    expect(state.openFiles[0]!.path).toBe('C:/project/src/main.ts');
    expect(state.persistedOpenPaths).toEqual(['C:/project/src/main.ts', 'C:/project/src/utils.ts']);
    expect(state.activeFilePath).toBe('C:/project/src/utils.ts');
  });

  it('reorders tabs and keeps persisted order in sync', async () => {
    const store = useCodeStore.getState();

    await store.openFile('file-a.ts');
    await store.openFile('file-b.ts');
    await store.openFile('file-c.ts');

    store.moveFile('file-c.ts', 0);

    const state = useCodeStore.getState();
    expect(state.openFiles[0]!.path).toBe('file-c.ts');
    expect(state.persistedOpenPaths[0]).toBe('file-c.ts');
    expect(state.activeFilePath).toBe('file-c.ts');
  });

  it('hydrates previously persisted tabs', async () => {
    const store = useCodeStore.getState();

    await store.openFile('hydrate-a.ts');
    await store.openFile('hydrate-b.ts');

    // simulate application restart
    useCodeStore.setState({
      openFiles: [],
      activeFilePath: null,
    });

    await useCodeStore.getState().hydrateOpenFiles();

    const state = useCodeStore.getState();
    expect(state.openFiles.length).toBe(2);
    expect(state.openFiles.map((f) => f.path)).toEqual(['hydrate-a.ts', 'hydrate-b.ts']);
  });
});

import '@testing-library/jest-dom';
import { vi } from 'vitest';

process.removeAllListeners('unhandledRejection');
process.on('unhandledRejection', (reason) => {
  if (
    reason instanceof TypeError &&
    (String(reason.message).includes('subscribe') ||
      String(reason.message).includes('is not a function'))
  ) {
    return;
  }
  if (reason instanceof Error && reason.message.includes('Closing rpc while')) {
    return;
  }
  console.error('Unhandled rejection in test:', reason);
  throw reason;
});

const globalWindow =
  typeof window !== 'undefined'
    ? window
    : (() => {
        const fallbackWindow = globalThis as typeof globalThis & Window;
        Object.defineProperty(globalThis, 'window', {
          value: fallbackWindow,
          writable: true,
          configurable: true,
        });
        return fallbackWindow;
      })();

if (!('document' in globalThis)) {
  Object.defineProperty(globalThis, 'document', {
    value: {
      createElement: vi.fn(() => ({
        getContext: vi.fn(),
      })),
      documentElement: {
        style: {},
      },
    },
    writable: true,
    configurable: true,
  });
}

if (!('navigator' in globalThis)) {
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      userAgent: 'vitest',
    },
    writable: true,
    configurable: true,
  });
}

if (!('localStorage' in globalThis)) {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
      clear: vi.fn(() => {
        storage.clear();
      }),
    },
    writable: true,
    configurable: true,
  });
}

if (!('sessionStorage' in globalThis)) {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
      clear: vi.fn(() => {
        storage.clear();
      }),
    },
    writable: true,
    configurable: true,
  });
}

if (!('HTMLCanvasElement' in globalThis)) {
  class CanvasElementMock {}

  Object.defineProperty(globalThis, 'HTMLCanvasElement', {
    value: CanvasElementMock,
    writable: true,
    configurable: true,
  });
}

Object.defineProperty(globalWindow, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(globalWindow, 'scrollTo', {
  writable: true,
  value: vi.fn(),
});

vi.spyOn(globalWindow, 'addEventListener');
vi.spyOn(globalWindow, 'removeEventListener');
vi.spyOn(globalWindow, 'dispatchEvent');

globalThis.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as unknown as typeof IntersectionObserver;

globalThis.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as unknown as typeof ResizeObserver;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
  once: vi.fn(),
}));

vi.mock('../lib/tauri-mock', async () => {
  const core = await import('@tauri-apps/api/core');
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test setup: core module re-export
    invoke: (core as any).invoke,
    isTauri: false,
    isCloudWeb: false,
    isDesktopUiDevLocal: false,
    isElectronHost: false,
    supportsLocalAppMode: false,
    isTauriContext: () => false,
    listen: vi.fn().mockResolvedValue(() => {}),
    emit: vi.fn().mockResolvedValue(undefined),
    once: vi.fn().mockResolvedValue(() => {}),
  };
});

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
  message: vi.fn(),
  ask: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  readBinaryFile: vi.fn(),
  writeBinaryFile: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  readDir: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: vi.fn(),
  open: vi.fn(),
}));

vi.mock('monaco-editor', () => ({
  editor: {
    create: vi.fn(),
    createModel: vi.fn(),
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
    IStandaloneCodeEditor: vi.fn(),
  },
  languages: {
    register: vi.fn(),
    registerCompletionItemProvider: vi.fn(),
    setMonarchTokensProvider: vi.fn(),
    setLanguageConfiguration: vi.fn(),
  },
  Range: vi.fn(),
  Selection: vi.fn(),
  KeyMod: { CtrlCmd: 2048, Shift: 1024, Alt: 512 },
  KeyCode: { Enter: 3, Escape: 9 },
}));

vi.mock('@monaco-editor/react', () => ({
  default: vi.fn(() => null),
  Editor: vi.fn(() => null),
  DiffEditor: vi.fn(() => null),
  useMonaco: vi.fn(() => null),
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(() => ({
    open: vi.fn(),
    write: vi.fn(),
    writeln: vi.fn(),
    clear: vi.fn(),
    reset: vi.fn(),
    dispose: vi.fn(),
    onData: vi.fn(),
    onResize: vi.fn(),
  })),
}));

vi.mock('sonner', () => {
  const toastFn = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    promise: vi.fn(),
    dismiss: vi.fn(),
    custom: vi.fn(),
    message: vi.fn(),
  });
  return { toast: toastFn };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test setup: mock canvas getContext
(HTMLCanvasElement.prototype as any).getContext = vi.fn(() => ({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(() => ({ data: [] })),
  putImageData: vi.fn(),
  createImageData: vi.fn(() => []),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  fillText: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  transform: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
}));

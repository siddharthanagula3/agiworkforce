/**
 * vscode.mock.ts — Shared VS Code API mocks for unit testing
 *
 * Provides mock implementations of vscode namespace objects used
 * across the extension. Import this in test files to set up the mock.
 */

import { vi } from 'vitest';

// ── SecretStorage ────────────────────────────────────────────────────────────

export function createMockSecretStorage(): {
  get: (key: string) => Promise<string | undefined>;
  store: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
  onDidChange: ReturnType<typeof vi.fn>;
} {
  const storage = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => storage.get(key)),
    store: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
    onDidChange: vi.fn(),
  };
}

// ── CancellationToken ────────────────────────────────────────────────────────

export function createMockCancellationToken(cancelled = false): {
  isCancellationRequested: boolean;
  onCancellationRequested: ReturnType<typeof vi.fn>;
} {
  return {
    isCancellationRequested: cancelled,
    onCancellationRequested: vi.fn(),
  };
}

export function createMockCancellationTokenSource(): {
  token: ReturnType<typeof createMockCancellationToken>;
  cancel: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  const token = createMockCancellationToken();
  return {
    token,
    cancel: vi.fn(() => {
      token.isCancellationRequested = true;
    }),
    dispose: vi.fn(),
  };
}

// ── Configuration ────────────────────────────────────────────────────────────

export function createMockConfiguration(values: Record<string, unknown> = {}): {
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(<T>(key: string, defaultValue?: T) => {
      return key in values ? (values[key] as T) : defaultValue;
    }),
    update: vi.fn(),
  };
}

// ── ExtensionContext ─────────────────────────────────────────────────────────

export function createMockExtensionContext(): {
  subscriptions: { dispose: ReturnType<typeof vi.fn> }[];
  secrets: ReturnType<typeof createMockSecretStorage>;
  extensionUri: { fsPath: string; toString: () => string };
  globalState: {
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    keys: ReturnType<typeof vi.fn>;
  };
  workspaceState: {
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    keys: ReturnType<typeof vi.fn>;
  };
} {
  const globalStateMap = new Map<string, unknown>();
  const workspaceStateMap = new Map<string, unknown>();

  return {
    subscriptions: [],
    secrets: createMockSecretStorage(),
    extensionUri: {
      fsPath: '/mock/extension',
      toString: () => 'file:///mock/extension',
    },
    globalState: {
      get: vi.fn(<T>(key: string) => globalStateMap.get(key) as T | undefined),
      update: vi.fn(async (key: string, value: unknown) => {
        globalStateMap.set(key, value);
      }),
      keys: vi.fn(() => [...globalStateMap.keys()]),
    },
    workspaceState: {
      get: vi.fn(<T>(key: string) => workspaceStateMap.get(key) as T | undefined),
      update: vi.fn(async (key: string, value: unknown) => {
        workspaceStateMap.set(key, value);
      }),
      keys: vi.fn(() => [...workspaceStateMap.keys()]),
    },
  };
}

// ── TextEditor / TextDocument ────────────────────────────────────────────────

export function createMockTextDocument(
  options: {
    text?: string;
    languageId?: string;
    fileName?: string;
    lineCount?: number;
  } = {},
): {
  getText: ReturnType<typeof vi.fn>;
  languageId: string;
  fileName: string;
  lineCount: number;
  uri: { fsPath: string; toString: () => string };
  lineAt: ReturnType<typeof vi.fn>;
  getWordRangeAtPosition: ReturnType<typeof vi.fn>;
} {
  const text = options.text ?? '';
  const lines = text.split('\n');
  return {
    getText: vi.fn((range?: unknown) => (range === undefined ? text : text)),
    languageId: options.languageId ?? 'typescript',
    fileName: options.fileName ?? '/mock/file.ts',
    lineCount: options.lineCount ?? lines.length,
    uri: {
      fsPath: options.fileName ?? '/mock/file.ts',
      toString: () => `file://${options.fileName ?? '/mock/file.ts'}`,
    },
    lineAt: vi.fn((line: number) => ({
      text: lines[line] ?? '',
      range: {
        start: { line, character: 0 },
        end: { line, character: (lines[line] ?? '').length },
      },
    })),
    getWordRangeAtPosition: vi.fn(() => ({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 5 },
    })),
  };
}

export function createMockSelection(
  startLine: number,
  startChar: number,
  endLine: number,
  endChar: number,
): {
  start: { line: number; character: number };
  end: { line: number; character: number };
  isEmpty: boolean;
} {
  return {
    start: { line: startLine, character: startChar },
    end: { line: endLine, character: endChar },
    isEmpty: startLine === endLine && startChar === endChar,
  };
}

export function createMockTextEditor(
  document: ReturnType<typeof createMockTextDocument>,
  selection?: ReturnType<typeof createMockSelection>,
): {
  document: ReturnType<typeof createMockTextDocument>;
  selection: ReturnType<typeof createMockSelection>;
} {
  return {
    document,
    selection: selection ?? createMockSelection(0, 0, 0, 0),
  };
}

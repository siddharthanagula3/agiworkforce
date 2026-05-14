/**
 * vscode.ts — Full mock of the VS Code API for unit testing
 *
 * This file is aliased as 'vscode' by vitest.config.ts so that source files
 * that import from 'vscode' can be tested without the VS Code host process.
 */

import { vi } from 'vitest';

// ─── SecretStorage ────────────────────────────────────────────────────────────

class MockSecretStorage {
  private _store = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this._store.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this._store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this._store.delete(key);
  }

  onDidChange = vi.fn();
}

// ─── EventEmitter ─────────────────────────────────────────────────────────────

class EventEmitter<T> {
  private _listeners: Array<(e: T) => void> = [];

  event = (listener: (e: T) => void): Disposable => {
    this._listeners.push(listener);
    return new Disposable(() => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    });
  };

  fire(data: T): void {
    for (const listener of this._listeners) {
      listener(data);
    }
  }

  dispose(): void {
    this._listeners = [];
  }
}

// ─── Disposable ───────────────────────────────────────────────────────────────

class Disposable {
  constructor(private readonly _fn: () => void = () => {}) {}

  dispose(): void {
    this._fn();
  }

  static from(...disposables: Disposable[]): Disposable {
    return new Disposable(() => {
      for (const d of disposables) {
        d.dispose();
      }
    });
  }
}

// ─── Uri ──────────────────────────────────────────────────────────────────────

class Uri {
  static file(path: string): Uri {
    return new Uri('file', '', path, '', '');
  }

  static joinPath(base: Uri, ...parts: string[]): Uri {
    const joined = [base.fsPath, ...parts].join('/').replace(/\/+/g, '/');
    return Uri.file(joined);
  }

  static parse(value: string): Uri {
    return new Uri('file', '', value, '', '');
  }

  constructor(
    public readonly scheme: string,
    public readonly authority: string,
    public readonly path: string,
    public readonly query: string,
    public readonly fragment: string,
  ) {}

  get fsPath(): string {
    return this.path;
  }

  with(
    change: Partial<{
      scheme: string;
      authority: string;
      path: string;
      query: string;
      fragment: string;
    }>,
  ): Uri {
    return new Uri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment,
    );
  }

  toString(): string {
    return `${this.scheme}://${this.authority}${this.path}${this.query ? '?' + this.query : ''}`;
  }
}

// ─── Position / Range / Selection ────────────────────────────────────────────

class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
}

class Range {
  constructor(
    public readonly start: Position | number,
    public readonly startCharacter?: number,
    public readonly end?: Position | number,
    public readonly endCharacter?: number,
  ) {
    if (
      typeof start === 'number' &&
      typeof startCharacter === 'number' &&
      typeof end === 'number' &&
      typeof endCharacter === 'number'
    ) {
      this.start = new Position(start, startCharacter);
      this.end = new Position(end, endCharacter);
    }
  }
}

class Selection extends Range {
  get isEmpty(): boolean {
    const s = this.start as Position;
    const e = this.end as Position;
    return s.line === e.line && s.character === e.character;
  }
}

// ─── TreeItem ─────────────────────────────────────────────────────────────────

class TreeItem {
  description?: string;
  tooltip?: string;
  iconPath?: unknown;
  contextValue?: string;
  command?: unknown;

  constructor(
    public label: string,
    public collapsibleState?: number,
  ) {}
}

// ─── ThemeIcon ────────────────────────────────────────────────────────────────

class ThemeIcon {
  constructor(public readonly id: string) {}
}

// ─── ThemeColor ───────────────────────────────────────────────────────────────

class ThemeColor {
  constructor(public readonly id: string) {}
}

// ─── CancellationTokenSource ─────────────────────────────────────────────────

class CancellationTokenSource {
  private _cancelled = false;
  private _emitter = new EventEmitter<void>();

  token = {
    isCancellationRequested: false,
    onCancellationRequested: (listener: () => void) => this._emitter.event(listener),
  };

  cancel(): void {
    if (!this._cancelled) {
      this._cancelled = true;
      this.token.isCancellationRequested = true;
      this._emitter.fire();
    }
  }

  dispose(): void {
    this._emitter.dispose();
  }
}

// ─── WorkspaceEdit ────────────────────────────────────────────────────────────

class WorkspaceEdit {
  private _edits: Array<{
    type: string;
    uri: Uri;
    content?: string;
    range?: Range;
    newText?: string;
  }> = [];

  createFile(uri: Uri, options?: unknown): void {
    this._edits.push({ type: 'createFile', uri });
  }

  insert(uri: Uri, position: Position, newText: string): void {
    this._edits.push({ type: 'insert', uri, newText });
  }

  replace(uri: Uri, range: Range, newText: string): void {
    this._edits.push({ type: 'replace', uri, range, newText });
  }

  deleteFile(uri: Uri): void {
    this._edits.push({ type: 'deleteFile', uri });
  }
}

// ─── StatusBarItem ────────────────────────────────────────────────────────────

class MockStatusBarItem {
  text = '';
  tooltip = '';
  command: string | undefined;
  backgroundColor: ThemeColor | undefined;

  show = vi.fn();
  hide = vi.fn();
  dispose = vi.fn();
}

// ─── ExtensionContext mock ────────────────────────────────────────────────────

class MockExtensionContext {
  subscriptions: Disposable[] = [];
  secrets = new MockSecretStorage();
  extensionUri = Uri.file('/mock/extension');
  private _globalState = new Map<string, unknown>();
  private _workspaceState = new Map<string, unknown>();

  globalState = {
    get: <T>(key: string): T | undefined => this._globalState.get(key) as T | undefined,
    update: async (key: string, value: unknown): Promise<void> => {
      this._globalState.set(key, value);
    },
    keys: (): readonly string[] => [...this._globalState.keys()],
    setKeysForSync: vi.fn(),
  };

  workspaceState = {
    get: <T>(key: string): T | undefined => this._workspaceState.get(key) as T | undefined,
    update: async (key: string, value: unknown): Promise<void> => {
      this._workspaceState.set(key, value);
    },
    keys: (): readonly string[] => [...this._workspaceState.keys()],
  };
}

// ─── TelemetrySender / TelemetryLogger ────────────────────────────────────────

class MockTelemetryLogger {
  logUsage = vi.fn();
  logError = vi.fn();
  dispose = vi.fn();
}

// ─── TextDocument / TextEditor mocks ─────────────────────────────────────────

class MockTextDocument {
  constructor(
    public readonly content: string = '',
    public readonly languageId: string = 'plaintext',
    public readonly uri: Uri = Uri.file('/mock/file.txt'),
  ) {}

  getText(_range?: Range): string {
    return this.content;
  }

  positionAt(offset: number): Position {
    let line = 0;
    let char = 0;
    for (let i = 0; i < Math.min(offset, this.content.length); i++) {
      if (this.content[i] === '\n') {
        line++;
        char = 0;
      } else {
        char++;
      }
    }
    return new Position(line, char);
  }

  get lineCount(): number {
    return this.content.split('\n').length;
  }

  get fileName(): string {
    return this.uri.fsPath;
  }

  lineAt(line: number): { text: string; range: Range } {
    const lines = this.content.split('\n');
    const text = lines[line] ?? '';
    return {
      text,
      range: new Range(line, 0, line, text.length),
    };
  }
}

// ─── Webview mock ─────────────────────────────────────────────────────────────

class MockWebview {
  html = '';
  options: unknown = {};
  cspSource = 'https://mock.csp.source';
  private _messageEmitter = new EventEmitter<unknown>();

  onDidReceiveMessage = this._messageEmitter.event;
  postMessage = vi.fn().mockResolvedValue(true);

  asWebviewUri(uri: Uri): Uri {
    return uri;
  }
}

// ─── MarkdownString ───────────────────────────────────────────────────────────

class MarkdownString {
  isTrusted?: boolean;
  supportThemeIcons?: boolean;

  constructor(public value: string = '') {}

  appendMarkdown(text: string): this {
    this.value += text;
    return this;
  }

  appendText(text: string): this {
    this.value += text;
    return this;
  }

  appendCodeblock(code: string, language?: string): this {
    this.value += `\`\`\`${language ?? ''}\n${code}\n\`\`\``;
    return this;
  }
}

// ─── ChatRequestTurn / ChatResponseTurn ───────────────────────────────────────

class ChatRequestTurn {
  constructor(
    public readonly prompt: string,
    public readonly command?: string,
  ) {}
}

class ChatResponseTurn {
  constructor(public readonly response: unknown[] = []) {}
}

class ChatResponseMarkdownPart {
  constructor(public readonly value: string | { value: string }) {}
}

// ─── LanguageModelChatMessage ─────────────────────────────────────────────────

class LanguageModelChatMessage {
  static User(content: string): LanguageModelChatMessage {
    return new LanguageModelChatMessage('user', content);
  }

  static Assistant(content: string): LanguageModelChatMessage {
    return new LanguageModelChatMessage('assistant', content);
  }

  constructor(
    public readonly role: string,
    public readonly content: string,
  ) {}
}

// ─── Exported vscode namespace ────────────────────────────────────────────────

export const window = {
  activeTextEditor: undefined as unknown,
  visibleTextEditors: [] as unknown[],
  showInformationMessage: vi.fn().mockResolvedValue(undefined),
  showWarningMessage: vi.fn().mockResolvedValue(undefined),
  showErrorMessage: vi.fn().mockResolvedValue(undefined),
  showInputBox: vi.fn().mockResolvedValue(undefined),
  showQuickPick: vi.fn().mockResolvedValue(undefined),
  showTextDocument: vi.fn().mockResolvedValue(undefined),
  createStatusBarItem: vi.fn(() => new MockStatusBarItem()),
  createTextEditorDecorationType: vi.fn(() => ({ dispose: vi.fn() })),
  createTerminal: vi.fn(() => ({ show: vi.fn(), sendText: vi.fn(), dispose: vi.fn() })),
  withProgress: vi.fn(
    async (_options: unknown, task: (progress: unknown, token: unknown) => Promise<void>) => {
      const progress = { report: vi.fn() };
      const token = { isCancellationRequested: false, onCancellationRequested: vi.fn() };
      return task(progress, token);
    },
  ),
  registerWebviewViewProvider: vi.fn(() => new Disposable()),
  registerTreeDataProvider: vi.fn(() => new Disposable()),
  createTreeView: vi.fn(() => ({
    reveal: vi.fn(),
    onDidChangeSelection: vi.fn(() => new Disposable()),
    dispose: vi.fn(),
  })),
  createOutputChannel: vi.fn(() => ({
    appendLine: vi.fn(),
    append: vi.fn(),
    clear: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
  })),
  terminals: [] as unknown[],
  onDidCloseTerminal: vi.fn(() => new Disposable()),
  onDidOpenTerminal: vi.fn(() => new Disposable()),
  onDidChangeActiveTerminal: vi.fn(() => new Disposable()),
  createWebviewPanel: vi.fn(() => ({
    webview: new MockWebview(),
    onDidDispose: vi.fn(),
    reveal: vi.fn(),
    dispose: vi.fn(),
  })),
  onDidChangeActiveTextEditor: vi.fn(() => new Disposable()),
  onDidChangeVisibleTextEditors: vi.fn(() => new Disposable()),
  tabGroups: {
    onDidChangeTabs: vi.fn(() => new Disposable()),
    all: [] as unknown[],
  },
};

export const workspace = {
  workspaceFolders: undefined as unknown,
  name: undefined as string | undefined,
  isTrusted: true,
  getConfiguration: vi.fn((_section?: string) => ({
    get: vi.fn(<T>(_key: string, defaultValue?: T): T | undefined => defaultValue),
    update: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockReturnValue(false),
    inspect: vi.fn().mockReturnValue(undefined),
  })),
  getWorkspaceFolder: vi.fn((_uri: Uri) => undefined as unknown),
  onDidChangeConfiguration: vi.fn(() => new Disposable()),
  onDidSaveTextDocument: vi.fn(() => new Disposable()),
  onDidOpenTextDocument: vi.fn(() => new Disposable()),
  onDidCloseTextDocument: vi.fn(() => new Disposable()),
  onDidChangeTextDocument: vi.fn(() => new Disposable()),
  onDidChangeWorkspaceFolders: vi.fn(() => new Disposable()),
  openTextDocument: vi.fn().mockResolvedValue(new MockTextDocument()),
  applyEdit: vi.fn().mockResolvedValue(true),
  registerTextDocumentContentProvider: vi.fn(() => new Disposable()),
  createFileSystemWatcher: vi.fn(() => ({
    onDidCreate: vi.fn(() => new Disposable()),
    onDidChange: vi.fn(() => new Disposable()),
    onDidDelete: vi.fn(() => new Disposable()),
    dispose: vi.fn(),
  })),
  fs: {
    readDirectory: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(new Uint8Array()),
    writeFile: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ type: 1, ctime: 0, mtime: 0, size: 0 }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  findFiles: vi.fn().mockResolvedValue([]),
  asRelativePath: vi.fn((uri: Uri | string) =>
    typeof uri === 'string' ? uri : uri.fsPath.replace('/mock/workspace/', ''),
  ),
};

export const languages = {
  registerCodeActionsProvider: vi.fn(() => new Disposable()),
  registerHoverProvider: vi.fn(() => new Disposable()),
  registerInlineCompletionItemProvider: vi.fn(() => new Disposable()),
  registerCodeLensProvider: vi.fn(() => new Disposable()),
  createDiagnosticCollection: vi.fn(() => ({
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  })),
};

export const commands = {
  registerCommand: vi.fn(() => new Disposable()),
  executeCommand: vi.fn().mockResolvedValue(undefined),
};

export const extensions = {
  getExtension: vi.fn(() => ({
    packageJSON: { version: '0.3.0' },
    isActive: true,
  })),
};

export const env = {
  isTelemetryEnabled: true,
  createTelemetryLogger: vi.fn((_sender: unknown, _options?: unknown) => new MockTelemetryLogger()),
  openExternal: vi.fn().mockResolvedValue(true),
};

export const lm = {
  selectChatModels: vi.fn().mockResolvedValue([]),
};

export const chat = {
  createChatParticipant: vi.fn((_id: string, _handler: unknown) => ({
    iconPath: undefined,
    followupProvider: undefined,
    dispose: vi.fn(),
  })),
};

// ─── Enums / Constants ────────────────────────────────────────────────────────

export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
} as const;

export const ViewColumn = {
  Active: -1,
  Beside: -2,
  One: 1,
  Two: 2,
  Three: 3,
} as const;

export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
} as const;

export const ProgressLocation = {
  Notification: 15,
  SourceControl: 1,
  Window: 10,
} as const;

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
} as const;

export const DiagnosticSeverity = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
} as const;

export const CodeActionKind = {
  QuickFix: { value: 'quickfix', append: (v: string) => ({ value: `quickfix.${v}` }) },
  Refactor: { value: 'refactor', append: (v: string) => ({ value: `refactor.${v}` }) },
  Empty: { value: '', append: (v: string) => ({ value: v }) },
};

export const InlineCompletionTriggerKind = {
  Automatic: 0,
  Invoke: 1,
} as const;

export const OverviewRulerLane = {
  Left: 1,
  Center: 2,
  Right: 4,
  Full: 7,
} as const;

export const FileType = {
  Unknown: 0,
  File: 1,
  Directory: 2,
  SymbolicLink: 64,
} as const;

export const ExtensionMode = {
  Production: 1,
  Development: 2,
  Test: 3,
} as const;

export const QuickPickItemKind = {
  Separator: -1,
  Default: 0,
} as const;

export const version = '1.95.0';

// ─── Class exports ────────────────────────────────────────────────────────────

export {
  CancellationTokenSource,
  Disposable,
  EventEmitter,
  MarkdownString,
  Position,
  Range,
  Selection,
  ThemeColor,
  ThemeIcon,
  TreeItem,
  Uri,
  WorkspaceEdit,
  ChatRequestTurn,
  ChatResponseTurn,
  ChatResponseMarkdownPart,
  LanguageModelChatMessage,
  MockExtensionContext as ExtensionContext,
  MockSecretStorage as SecretStorage,
  MockTelemetryLogger as TelemetryLogger,
};

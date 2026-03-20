/**
 * workspaceIndexer.ts — Lightweight workspace context gatherer
 *
 * Indexes source files and their top-level symbols to provide
 * relevant workspace context to AI requests.
 * Cap: 500 files, 5000 symbols. Incremental updates via file watcher.
 */

import * as vscode from 'vscode';

export interface FileEntry {
  uri: vscode.Uri;
  language: string;
  symbols: string[];
  size: number;
}

const CACHE_KEY = 'agiWorkforce.workspaceIndex';
const MAX_FILES = 500;
const MAX_SYMBOLS_TOTAL = 5000;

interface CacheEntry {
  timestamp: number;
  files: Array<{ path: string; language: string; symbols: string[]; size: number }>;
}

export class WorkspaceIndexer {
  private _fileWatcher: vscode.FileSystemWatcher | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  isStale(): boolean {
    const cache = this.context.workspaceState.get<CacheEntry>(CACHE_KEY);
    return cache === undefined;
  }

  /**
   * Register a file watcher for incremental index updates.
   * Call once during extension activation.
   */
  registerFileWatcher(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    this._fileWatcher = vscode.workspace.createFileSystemWatcher(
      '**/*.{ts,tsx,js,jsx,py,go,rs,java,cs,cpp,c,h,rb,php,swift,kt}',
    );

    const handleChange = (uri: vscode.Uri): void => {
      void this._reindexFile(uri);
    };

    disposables.push(
      this._fileWatcher,
      this._fileWatcher.onDidChange(handleChange),
      this._fileWatcher.onDidCreate(handleChange),
      this._fileWatcher.onDidDelete((uri) => {
        void this._removeFile(uri);
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        void this._reindexFile(doc.uri);
      }),
    );

    return disposables;
  }

  /**
   * Re-index a single file in the cache (incremental update).
   */
  private async _reindexFile(uri: vscode.Uri): Promise<void> {
    const cache = this.context.workspaceState.get<CacheEntry>(CACHE_KEY);
    if (cache === undefined) return; // No index yet — skip incremental, wait for full index.

    const relativePath = vscode.workspace.asRelativePath(uri);

    try {
      const stat = await vscode.workspace.fs.stat(uri);
      const symbols = await this._getSymbols(uri);

      // Remove existing entry for this file.
      const files = cache.files.filter((f) => f.path !== relativePath);

      files.push({
        path: relativePath,
        language: this._inferLanguage(uri),
        symbols: symbols.slice(0, 50),
        size: stat.size,
      });

      await this.context.workspaceState.update(CACHE_KEY, {
        timestamp: Date.now(),
        files,
      } satisfies CacheEntry);
    } catch {
      // File may have been deleted between event and handler — ignore.
    }
  }

  /**
   * Remove a file from the index cache.
   */
  private async _removeFile(uri: vscode.Uri): Promise<void> {
    const cache = this.context.workspaceState.get<CacheEntry>(CACHE_KEY);
    if (cache === undefined) return;

    const relativePath = vscode.workspace.asRelativePath(uri);
    const files = cache.files.filter((f) => f.path !== relativePath);

    await this.context.workspaceState.update(CACHE_KEY, {
      timestamp: Date.now(),
      files,
    } satisfies CacheEntry);
  }

  async index(): Promise<void> {
    const uris = await vscode.workspace.findFiles(
      '**/*.{ts,tsx,js,jsx,py,go,rs,java,cs,cpp,c,h,rb,php,swift,kt}',
      '{**/node_modules/**,**/dist/**,**/build/**,**/.next/**,**/target/**}',
      MAX_FILES,
    );

    const files: CacheEntry['files'] = [];
    let totalSymbols = 0;

    for (const uri of uris) {
      if (totalSymbols >= MAX_SYMBOLS_TOTAL) break;

      try {
        const stat = await vscode.workspace.fs.stat(uri);
        const symbols = await this._getSymbols(uri);
        const remaining = MAX_SYMBOLS_TOTAL - totalSymbols;
        const limited = symbols.slice(0, remaining);
        totalSymbols += limited.length;

        files.push({
          path: vscode.workspace.asRelativePath(uri),
          language: this._inferLanguage(uri),
          symbols: limited,
          size: stat.size,
        });
      } catch {
        // Skip files that can't be read/symbolized
      }
    }

    const cache: CacheEntry = { timestamp: Date.now(), files };
    await this.context.workspaceState.update(CACHE_KEY, cache);
  }

  /**
   * Return workspace context relevant to the query, up to `maxChars`.
   * When no maxChars is provided, uses a default of 2000.
   */
  getRelevantContext(query: string, maxChars?: number): string {
    const budget = maxChars ?? 2000;
    const cache = this.context.workspaceState.get<CacheEntry>(CACHE_KEY);
    if (cache === undefined) return '';

    const queryWords = query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2);
    if (queryWords.length === 0) return '';

    const scored = cache.files.map((file) => {
      const allText = [file.path, ...file.symbols].join(' ').toLowerCase();
      const score = queryWords.reduce((sum, word) => sum + (allText.includes(word) ? 1 : 0), 0);
      return { file, score };
    });

    const relevant = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    if (relevant.length === 0) return '';

    let output = 'Workspace context:\n';
    for (const { file } of relevant) {
      const symbolList = file.symbols.slice(0, 8).join(', ');
      const line = `- ${file.path}${symbolList ? `: ${symbolList}` : ''}\n`;
      if (output.length + line.length > budget) break;
      output += line;
    }

    return output;
  }

  private async _getSymbols(uri: vscode.Uri): Promise<string[]> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri,
      );
      if (!Array.isArray(symbols)) return [];
      return symbols
        .filter((s) => s.kind <= vscode.SymbolKind.Property)
        .map((s) => s.name)
        .slice(0, 50);
    } catch {
      return [];
    }
  }

  private _inferLanguage(uri: vscode.Uri): string {
    const ext = uri.fsPath.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescriptreact',
      js: 'javascript',
      jsx: 'javascriptreact',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      cs: 'csharp',
      cpp: 'cpp',
      c: 'c',
      h: 'c',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
    };
    return map[ext] ?? ext;
  }
}

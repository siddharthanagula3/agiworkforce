/**
 * Type declarations for optional code execution dependencies.
 * These packages are dynamically imported at runtime and may not be installed.
 *
 * - @webcontainer/api: Browser-based Node.js runtime (requires cross-origin isolation)
 * - pyodide: Browser-based Python runtime via WebAssembly (loaded from CDN)
 */

declare module '@webcontainer/api' {
  export interface WebContainerProcess {
    output: ReadableStream<string>;
    exit: Promise<number>;
  }

  export interface FileSystemAPI {
    writeFile(path: string, content: string): Promise<void>;
    readFile(path: string, encoding: string): Promise<string>;
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  }

  export interface WebContainer {
    spawn(
      command: string,
      args: string[],
      options?: { timeout?: number },
    ): Promise<WebContainerProcess>;
    fs: FileSystemAPI;
    mount(fileTree: Record<string, unknown>): Promise<void>;
    teardown(): Promise<void>;
  }

  export const WebContainer: {
    boot(): Promise<WebContainer>;
  };
}

declare module 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.mjs' {
  export interface PyodideInterface {
    runPythonAsync(code: string): Promise<unknown>;
    loadPackage(packages: string[]): Promise<void>;
    globals: {
      get(name: string): unknown;
      set(name: string, value: unknown): void;
    };
  }

  export function loadPyodide(options?: { indexURL?: string }): Promise<PyodideInterface>;
}

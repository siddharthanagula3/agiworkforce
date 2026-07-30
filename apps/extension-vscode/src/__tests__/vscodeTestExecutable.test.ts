import { describe, expect, it, vi } from 'vitest';
import { resolveVsCodeExecutablePath } from '../test/resolveVsCodeExecutable';

describe('resolveVsCodeExecutablePath', () => {
  it('uses the launcher path returned by @vscode/test-electron when it exists', () => {
    const exists = vi.fn((candidate: string) => candidate === '/download/code');

    expect(resolveVsCodeExecutablePath('/download/code', 'linux', exists)).toBe('/download/code');
    expect(exists).toHaveBeenCalledOnce();
  });

  it('uses the verified Code basename when the macOS harness returns legacy Electron', () => {
    const legacy = '/download/Visual Studio Code.app/Contents/MacOS/Electron';
    const current = '/download/Visual Studio Code.app/Contents/MacOS/Code';
    const exists = vi.fn((candidate: string) => candidate === current);

    expect(resolveVsCodeExecutablePath(legacy, 'darwin', exists)).toBe(current);
  });

  it('fails closed when neither the returned path nor a product-owned fallback exists', () => {
    expect(() =>
      resolveVsCodeExecutablePath(
        '/download/Visual Studio Code.app/Contents/MacOS/Electron',
        'darwin',
        () => false,
      ),
    ).toThrow(/Downloaded VS Code executable was not found/u);
  });
});

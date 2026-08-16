import { describe, expect, it } from 'vitest';
import * as webFs from '../fs';

describe('tauri-web fs shim', () => {
  it('exports every binding the aliased module is imported for', () => {
    for (const name of ['exists', 'readTextFile', 'readFile', 'writeTextFile', 'mkdir']) {
      expect(typeof (webFs as Record<string, unknown>)[name], `missing export: ${name}`).toBe(
        'function',
      );
    }
  });

  it('rejects reads rather than pretending to return file contents', async () => {
    await expect(webFs.readFile('/etc/hosts')).rejects.toThrow(/desktop application/i);
    await expect(webFs.readTextFile()).rejects.toThrow(/desktop application/i);
  });

  it('reports nothing exists in the browser sandbox', async () => {
    await expect(webFs.exists()).resolves.toBe(false);
  });
});

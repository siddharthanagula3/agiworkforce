/**
 * fs.test.ts — the browser-dev shim for @tauri-apps/plugin-fs.
 *
 * vite.config.ts aliases '@tauri-apps/plugin-fs' to this module for the web dev
 * target. A missing named export is therefore not a runtime error at the call
 * site — it is a module-resolution failure at import time, which takes down
 * every component in the same chunk.
 *
 * features/context-handoff/readFolderFiles.ts imported `readFile`, which this
 * module never exported. The result was "does not provide an export named
 * 'readFile'" before anything rendered, so Desktop Local mode in the browser
 * died at the error boundary showing "Chat interface encountered an error" —
 * with no mention of files, which is why it went unexplained.
 */
import { describe, expect, it } from 'vitest';
import * as webFs from '../fs';

describe('tauri-web fs shim', () => {
  it('exports every binding the aliased module is imported for', () => {
    // Import-time completeness is the invariant. Adding a named import in app
    // code without adding it here breaks the whole chunk, not one call.
    for (const name of ['exists', 'readTextFile', 'readFile', 'writeTextFile', 'mkdir']) {
      expect(typeof (webFs as Record<string, unknown>)[name], `missing export: ${name}`).toBe(
        'function',
      );
    }
  });

  it('rejects reads rather than pretending to return file contents', async () => {
    // Returning empty bytes would let callers proceed as though an empty file
    // had been read, which is worse than an explicit failure.
    await expect(webFs.readFile('/etc/hosts')).rejects.toThrow(/desktop application/i);
    await expect(webFs.readTextFile()).rejects.toThrow(/desktop application/i);
  });

  it('reports nothing exists in the browser sandbox', async () => {
    await expect(webFs.exists()).resolves.toBe(false);
  });
});

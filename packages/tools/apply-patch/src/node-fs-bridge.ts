/**
 * Default `FSBridge` implementation backed by `node:fs/promises`.
 *
 * Resolves relative hunk paths against `cwd`. When `workspaceOnly: true`
 * (the default in apply-patch options), the caller-side guard checks the
 * resolved absolute path is rooted under `cwd` before any fs op. We don't
 * re-check inside the bridge so that callers with their own boundary
 * enforcement (sandbox, Tauri scope guard) can skip the redundant check.
 */

import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import type { FSBridge } from './types';

export interface NodeFSBridgeOptions {
  cwd?: string;
}

export function nodeFSBridge(options: NodeFSBridgeOptions = {}): FSBridge {
  const cwd = options.cwd ?? process.cwd();

  const abs = (p: string): string => (isAbsolute(p) ? p : resolve(cwd, p));

  return {
    async readFile(path: string): Promise<string> {
      return readFile(abs(path), 'utf-8');
    },
    async writeFile(path: string, contents: string): Promise<void> {
      const target = abs(path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents, 'utf-8');
    },
    async remove(path: string): Promise<void> {
      await rm(abs(path), { force: true });
    },
    async mkdirp(path: string): Promise<void> {
      await mkdir(abs(path), { recursive: true });
    },
    async exists(path: string): Promise<boolean> {
      try {
        await stat(abs(path));
        return true;
      } catch {
        return false;
      }
    },
  };
}

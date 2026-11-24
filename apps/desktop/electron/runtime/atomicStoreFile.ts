import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, openSync, renameSync, rmSync, writeFileSync } from 'node:fs';

export class StoreWriteError extends Error {}

export function replaceStoreFile(target: string, text: string): void {
  const staged = `${target}.${randomUUID()}.tmp`;
  const descriptor = openSync(staged, 'wx', 0o600);
  try {
    try {
      writeFileSync(descriptor, text, 'utf8');
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(staged, target);
  } catch (error) {
    try {
      rmSync(staged, { force: true });
    } catch {
      // Preserve the write error if the private staging file cannot be removed.
    }
    throw error;
  }
}

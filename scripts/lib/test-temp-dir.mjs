import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const createdDirs = new Set();

process.on('exit', () => {
  for (const dir of createdDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

export function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  createdDirs.add(dir);
  return dir;
}

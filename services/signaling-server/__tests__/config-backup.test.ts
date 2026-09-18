import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  CONFIG_VARIABLES,
  buildConfigBackup,
  configBackupDrift,
  persistConfigBackup,
  readLatestConfigBackup,
} from '../src/config-backup.js';
import { CONFIG_BACKUP_RETENTION } from '../src/constants.js';

const SECRET = 'super-secret-internal-value';

const ENV = {
  NODE_ENV: 'production',
  ALLOWED_ORIGINS: 'https://app.example',
  SIGNALING_CANONICAL_URL: 'https://signal.example',
  NEON_DATABASE_URL: 'postgresql://user:password@host/db',
  SIGNALING_INTERNAL_SECRET: SECRET,
  FLY_APP_NAME: 'agiworkforce-signaling',
  AGI_DEPLOYMENT_ID: 'machine-7a1f',
};

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'signaling-config-backup-'));
}

describe('buildConfigBackup', () => {
  it('never carries a secret value, only a digest of it', () => {
    const backup = buildConfigBackup(ENV);
    const serialized = JSON.stringify(backup);

    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain('password');
    const secretVar = backup.variables.find((v) => v.name === 'SIGNALING_INTERNAL_SECRET');
    expect(secretVar?.present).toBe(true);
    expect(secretVar?.value).toBeUndefined();
    expect(secretVar?.digest).toMatch(/^[0-9a-f]{16}$/);
  });

  it('keeps non-secret values so a restore can reproduce them', () => {
    const backup = buildConfigBackup(ENV);
    const origins = backup.variables.find((v) => v.name === 'ALLOWED_ORIGINS');

    expect(origins?.value).toBe('https://app.example');
  });

  it('names the deployment the configuration was taken from', () => {
    expect(buildConfigBackup(ENV).deployment).toMatchObject({
      target: 'fly',
      id: 'machine-7a1f',
    });
  });

  it('reports required variables the deployment is missing', () => {
    const backup = buildConfigBackup({ NODE_ENV: 'production' });

    expect(backup.missingRequired).toEqual(
      expect.arrayContaining(['ALLOWED_ORIGINS', 'NEON_DATABASE_URL', 'SIGNALING_INTERNAL_SECRET']),
    );
  });

  it('covers every variable the environment contract documents', async () => {
    const example = await readFile(path.join(import.meta.dirname, '..', '.env.example'), 'utf8');
    const documented = [...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]);
    const covered = new Set(CONFIG_VARIABLES.map((spec) => spec.name));

    expect(documented.filter((name) => !covered.has(name as string))).toEqual([]);
  });
});

describe('configBackupDrift', () => {
  it('reports a changed secret without revealing either value', () => {
    const before = buildConfigBackup(ENV);
    const after = buildConfigBackup({ ...ENV, SIGNALING_INTERNAL_SECRET: 'rotated' });

    expect(configBackupDrift(before, after)).toEqual(['SIGNALING_INTERNAL_SECRET']);
  });

  it('reports a variable that was removed between deploys', () => {
    const before = buildConfigBackup(ENV);
    const after = buildConfigBackup({ ...ENV, ALLOWED_ORIGINS: '' });

    expect(configBackupDrift(before, after)).toEqual(['ALLOWED_ORIGINS']);
  });

  it('is empty when nothing moved', () => {
    expect(configBackupDrift(buildConfigBackup(ENV), buildConfigBackup(ENV))).toEqual([]);
  });
});

describe('persistConfigBackup', () => {
  it('writes a snapshot and reads it back as the latest', async () => {
    const directory = await tempDir();

    const { file, drift } = await persistConfigBackup(
      directory,
      ENV,
      new Date('2026-09-18T10:00:00Z'),
    );

    expect(drift).toEqual([]);
    expect(await readFile(file, 'utf8')).toContain('"capturedAt"');
    expect((await readLatestConfigBackup(directory))?.capturedAt).toBe('2026-09-18T10:00:00.000Z');
  });

  it('reports what changed since the previous deploy', async () => {
    const directory = await tempDir();
    await persistConfigBackup(directory, ENV, new Date('2026-09-18T10:00:00Z'));

    const second = await persistConfigBackup(
      directory,
      { ...ENV, ALLOWED_ORIGINS: 'https://other.example' },
      new Date('2026-09-18T11:00:00Z'),
    );

    expect(second.drift).toEqual(['ALLOWED_ORIGINS']);
  });

  it('keeps a bounded history rather than one file per restart', async () => {
    const directory = await tempDir();
    for (let index = 0; index < CONFIG_BACKUP_RETENTION + 4; index += 1) {
      await persistConfigBackup(directory, ENV, new Date(Date.UTC(2026, 8, 18, 10, index, 0)));
    }

    expect(await readdir(directory)).toHaveLength(CONFIG_BACKUP_RETENTION);
  });

  it('survives an unreadable previous snapshot', async () => {
    const directory = await tempDir();
    await writeFile(path.join(directory, 'config-backup-broken.json'), '{not json');

    await expect(persistConfigBackup(directory, ENV)).resolves.toMatchObject({ drift: [] });
  });
});

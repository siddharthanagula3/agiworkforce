import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0079_desktop_release_channels.sql'),
  'utf8',
);

describe('desktop release channels migration', () => {
  it('persists and constrains all workflow-supported channels', () => {
    expect(migration).toContain('add column if not exists channel text');
    expect(migration).toContain("check (channel in ('stable', 'beta', 'nightly'))");
    expect(migration).toContain('releases_platform_channel_published_idx');
    expect(migration).toMatch(/when is_prerelease = false then 'stable'/u);
    expect(migration).toMatch(/then 'nightly'[\s\S]*else 'beta'/u);
  });

  it('makes reads and writes fail closed across channel boundaries', () => {
    expect(migration).toContain('r.channel = p_channel');
    expect(migration).toContain("r.is_prerelease = (p_channel <> 'stable')");
    expect(migration).toContain("p_is_prerelease <> (p_channel <> 'stable')");
    expect(migration).toContain('is_prerelease, is_critical, channel');
    expect(migration).toContain('channel = excluded.channel');
  });
});

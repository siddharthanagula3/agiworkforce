import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const privacySection = readFileSync(
  join(process.cwd(), 'features/settings/sections/PrivacySection.tsx'),
  'utf8',
);
const settingsStore = readFileSync(
  join(process.cwd(), 'shared/stores/web-settings-store.ts'),
  'utf8',
);

function webSourcesMentioning(needle: string): string[] {
  const repoRoot = resolve(process.cwd(), '../..');
  return execFileSync('git', ['grep', '-l', needle, '--', 'apps/web'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
    .filter((file) => !file.includes('__tests__') && !file.endsWith('.test.ts'));
}

/**
 * A whole Sync page used to describe, by category, what syncs from where. Most
 * of it was about other surfaces and its status pills were words typed into the
 * markup. It is replaced by one sentence next to the export control, and a
 * sentence that promises specific behaviour still has to be checkable against
 * the code that would provide it.
 */
describe('the browser sync statement describes what actually happens', () => {
  it('is the sentence the Privacy pane shows beside export', () => {
    expect(privacySection).toMatch(
      /Artifacts you create here are synced to your account; conversations are stored in your account directly, not synced from this browser\./,
    );
  });

  it('claims artifacts sync because the only web client of the sync protocol pushes them', () => {
    const clients = webSourcesMentioning("'/api/chat/sync'");
    expect(clients).toContain('apps/web/features/chat/services/artifact-cloud-sync.ts');
    expect(clients.filter((file) => !file.startsWith('apps/web/app/api/'))).toEqual([
      'apps/web/features/chat/services/artifact-cloud-sync.ts',
    ]);
  });

  it('claims conversations are stored rather than synced, and nothing pushes them', () => {
    const push = readFileSync(
      join(process.cwd(), 'features/chat/services/artifact-cloud-sync.ts'),
      'utf8',
    );
    expect(push).toMatch(/artifacts \}\)/);
    expect(push).not.toMatch(/conversations:/);
  });

  it('makes no claim about appearance, which lives in a device-local store', () => {
    expect(settingsStore).toContain('createJSONStorage(() => localStorage)');
    expect(privacySection).not.toMatch(/appearance[\s\S]{0,40}sync/i);
  });

  it('leaves the other surfaces to describe themselves', () => {
    expect(privacySection).not.toMatch(/Desktop Cloud syncs/i);
  });
});

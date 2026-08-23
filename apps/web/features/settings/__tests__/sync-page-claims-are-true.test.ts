import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'app/settings/sync/page.tsx'), 'utf8');
const settingsStore = readFileSync(
  join(process.cwd(), 'shared/stores/web-settings-store.ts'),
  'utf8',
);
const i18nInit = readFileSync(join(process.cwd(), 'app/i18n/index.ts'), 'utf8');

// This page names, by category, what syncs. It previously claimed appearance,
// language and chat preferences sync "automatically across Web and Mobile" —
// web writes and reads none of the three. A page that promises specific
// behaviour has to be checkable against the code that would provide it.
describe('the sync page describes what actually syncs', () => {
  it('does not claim appearance syncs while it lives in a device-local store', () => {
    expect(settingsStore).toContain('createJSONStorage(() => localStorage)');
    expect(page).toMatch(/Appearance, display language and chat preferences do NOT sync/i);
  });

  it('does not claim language syncs while it is only cached by the browser detector', () => {
    expect(i18nInit).toMatch(/caches: \['cookie', 'localStorage'\]/);
    expect(page).not.toMatch(/language.{0,40}sync automatically/i);
  });

  it('still names the two categories that genuinely do sync from web', () => {
    // personalization and notifications are both written through
    // savePreferenceNamespace and read server-side.
    expect(page).toMatch(/Personalization and notification preferences sync automatically/i);
  });

  it('keeps the secrets-never-sync statement, which is the load-bearing one', () => {
    expect(page).toMatch(/Secrets[\s\S]{0,120}never sync/i);
  });
});

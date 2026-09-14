import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);

describe('side panel Site Allowlist control requests real Chrome access', () => {
  it('imports the host-permission helpers rather than reimplementing them', () => {
    expect(source).toContain(
      "import {\n  removeApprovedSiteHostPermission,\n  requestApprovedSiteHostPermission,\n} from './features/options/site-allowlist';",
    );
  });

  it('asks Chrome for host access before an "Add" ever reaches storage', () => {
    const start = source.indexOf("allowlistToggleBtn.addEventListener('click'");
    const end = source.indexOf('\n  });', start);
    const handlerBody = source.slice(start, end);

    // The "Add" path is everything after the early-return removing branch.
    const removingBranchEnd = handlerBody.indexOf(
      '\n    }\n',
      handlerBody.indexOf('if (removing)'),
    );
    const addBranch = handlerBody.slice(removingBranchEnd);

    const requestIndex = addBranch.indexOf('requestApprovedSiteHostPermission(origin)');
    const writeIndex = addBranch.indexOf('drawerWriteAllowlist(');
    expect(requestIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(requestIndex);

    // A refusal must never be treated as success: no write happens on that path.
    expect(addBranch).toContain('if (!hostGranted)');
    expect(addBranch.indexOf('return;')).toBeLessThan(writeIndex);
  });

  it('revokes host access from both remove entry points, not only storage', () => {
    const occurrences = source.split('await removeApprovedSiteHostPermission(origin);').length - 1;
    expect(occurrences).toBe(2);

    for (const marker of [
      "const removing = allowlistToggleBtn.classList.contains('is-remove');",
      "removeBtn.addEventListener('click', async () => {",
    ]) {
      const markerIndex = source.indexOf(marker);
      expect(markerIndex).toBeGreaterThan(-1);
      const nextRemoveCall = source.indexOf(
        'removeApprovedSiteHostPermission(origin)',
        markerIndex,
      );
      const nextWrite = source.indexOf('drawerWriteAllowlist(', markerIndex);
      expect(nextRemoveCall).toBeGreaterThan(markerIndex);
      expect(nextWrite).toBeGreaterThan(nextRemoveCall);
    }
  });

  it('reads the current-tab origin synchronously at click time so the request stays inside the user gesture', () => {
    const start = source.indexOf("allowlistToggleBtn.addEventListener('click'");
    const end = source.indexOf('\n  });', start);
    const handlerBody = source.slice(start, end);
    const firstLine = handlerBody.split('\n')[1]?.trim();
    expect(firstLine).toBe('const origin = currentAllowlistOrigin;');
  });
});

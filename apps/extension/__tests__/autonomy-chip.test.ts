import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  browserPermissionModeToStored,
  DEFAULT_BROWSER_PERMISSION_MODE,
  readBrowserPermissionMode,
} from '../src/features/computer-use/askBeforeActing';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, '..', rel), 'utf8');

const panel = read('src/side_panel.ts');
const background = read('src/background.ts');

describe('autonomy chip', () => {
  it('exists in the composer chip row', () => {
    expect(panel).toContain("id: 'sp-autonomy-chip'");
    expect(panel).toContain('composerBarStart.appendChild(autonomyControl)');
  });

  it('reads the same pref the authoritative gate reads', () => {
    expect(panel).toContain('chrome.storage.local.get(ASK_BEFORE_ACTING_KEY');
    expect(background).toContain('ASK_BEFORE_ACTING_KEY');
  });

  it('defaults to Auto, read the same way by the panel and the background', () => {
    expect(DEFAULT_BROWSER_PERMISSION_MODE).toBe('auto');
    expect(readBrowserPermissionMode(undefined)).toBe('auto');
    expect(readBrowserPermissionMode('auto')).toBe('auto');
    expect(readBrowserPermissionMode(true)).toBe('ask');
    expect(readBrowserPermissionMode(false)).toBe('full');
    for (const mode of ['ask', 'auto', 'full'] as const) {
      expect(readBrowserPermissionMode(browserPermissionModeToStored(mode))).toBe(mode);
    }
    expect(panel).toContain('renderAutonomyChip(DEFAULT_BROWSER_PERMISSION_MODE)');
    expect(panel).toContain('readBrowserPermissionMode(items[ASK_BEFORE_ACTING_KEY])');
    expect(background).toContain('readBrowserPermissionMode(askPref[ASK_BEFORE_ACTING_KEY])');
  });

  it('labels all three modes and tints the permissive one as a warning', () => {
    expect(panel).toContain("t('spAutonomyAskFirst')");
    expect(panel).toContain("t('spAutonomyAuto')");
    expect(panel).toContain("t('spAutonomyFullAccess')");
    expect(panel).toContain(".sp-autonomy-chip[data-mode='full']");
    expect(panel).toMatch(
      /\.sp-autonomy-chip\[data-mode='full'\] \{[^}]*color: var\(--agi-ext-warning-text\);/,
    );
  });

  it('stays in sync with the Computer Use checkbox in both directions', () => {
    expect(panel).toContain('changes[ASK_BEFORE_ACTING_KEY]');
    const computerUsePanel = read('src/features/side-panel/computerUsePanel.ts');
    expect(computerUsePanel).toContain('ASK_BEFORE_ACTING_KEY in changes');
    expect(computerUsePanel).toMatch(
      /readBrowserPermissionMode\(changes\[ASK_BEFORE_ACTING_KEY\]\?\.newValue\) === 'ask'/,
    );
  });

  it('never writes the checkbox back to storage when a run starts', () => {
    expect(panel).not.toContain('[ASK_BEFORE_ACTING_KEY]: cuPanel.isAskBeforeActing()');
  });

  it('exposes the mode to assistive tech', () => {
    expect(panel).toContain("autonomyChip.setAttribute('aria-pressed'");
    expect(panel).toContain("role: 'menuitemradio'");
    expect(panel).toContain("autonomyChip.setAttribute('aria-expanded'");
    expect(panel).toContain("t('spAutonomyAskFirstAria')");
  });

  it('requires an explicit menu choice before enabling full access', () => {
    const chipHandlerStart = panel.indexOf("autonomyChip.addEventListener('click'");
    const chipHandlerEnd = panel.indexOf('const fullAccessNotice = el(', chipHandlerStart);
    const chipHandler = panel.slice(chipHandlerStart, chipHandlerEnd);
    expect(chipHandlerStart).toBeGreaterThan(-1);
    expect(chipHandler).not.toContain('chrome.storage.local.set');
    expect(panel).toMatch(
      /entry\.option\.addEventListener\('click', \(\) => chooseAutonomyMode\(entry\.mode\)\)/,
    );
    expect(panel).toMatch(
      /function chooseAutonomyMode[\s\S]{0,400}\[ASK_BEFORE_ACTING_KEY\]: browserPermissionModeToStored\(mode\)/,
    );
  });
});

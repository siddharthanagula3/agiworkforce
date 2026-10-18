import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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

  it('defaults to the safe state, matching background.ts', () => {
    expect(panel).toContain('renderAutonomyChip(true)');
    expect(panel).toMatch(/items\[ASK_BEFORE_ACTING_KEY\]\s*!==\s*false/);
    expect(background).toMatch(/askPref\[ASK_BEFORE_ACTING_KEY\]\s*!==\s*false/);
  });

  it('labels both states and tints the permissive one as a warning', () => {
    expect(panel).toContain("t('spAutonomyAskFirst')");
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
      /askCheckbox\.checked = changes\[ASK_BEFORE_ACTING_KEY\]\?\.newValue !== false/,
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
    const fullAccessHandlerStart = panel.indexOf("fullAccessOption.addEventListener('click'");
    const fullAccessHandlerEnd = panel.indexOf(
      "autonomyPopover.addEventListener('keydown'",
      fullAccessHandlerStart,
    );
    const chipHandler = panel.slice(chipHandlerStart, fullAccessHandlerStart);
    const fullAccessHandler = panel.slice(fullAccessHandlerStart, fullAccessHandlerEnd);

    expect(chipHandler).not.toContain('[ASK_BEFORE_ACTING_KEY]: false');
    expect(fullAccessHandler).toContain('[ASK_BEFORE_ACTING_KEY]: false');
  });
});

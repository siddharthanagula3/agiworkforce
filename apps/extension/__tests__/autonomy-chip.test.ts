import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, '..', rel), 'utf8');

const panel = read('src/side_panel.ts');
const background = read('src/background.ts');

describe('autonomy chip', () => {
  it('exists in the composer trust strip', () => {
    expect(panel).toContain("id: 'sp-autonomy-chip'");
    expect(panel).toContain('trustStrip.appendChild(autonomyControl)');
  });

  it('reads the same pref the authoritative gate reads', () => {
    expect(panel).toContain("chrome.storage.local.get('agi_cu_ask_before_acting'");
    expect(background).toContain('agi_cu_ask_before_acting');
  });

  it('defaults to the safe state, matching background.ts', () => {
    expect(panel).toContain('renderAutonomyChip(true)');
    expect(panel).toMatch(/agi_cu_ask_before_acting'\]\s*!==\s*false/);
    expect(background).toMatch(/agi_cu_ask_before_acting'\]\s*!==\s*false/);
  });

  it('labels both states and tints the permissive one as a warning', () => {
    expect(panel).toContain("t('spAutonomyAskFirst')");
    expect(panel).toContain("t('spAutonomyFullAccess')");
    expect(panel).toContain(".sp-autonomy-chip[data-mode='full']");
    expect(panel).toContain('--agi-ext-warning-bg');
  });

  it('stays in sync with the Computer Use checkbox', () => {
    expect(panel).toContain("changes['agi_cu_ask_before_acting']");
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

    expect(chipHandler).not.toContain('agi_cu_ask_before_acting: false');
    expect(fullAccessHandler).toContain('agi_cu_ask_before_acting: false');
  });
});

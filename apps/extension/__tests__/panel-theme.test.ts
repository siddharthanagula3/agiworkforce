import { describe, expect, it } from 'vitest';
import { getExtensionTokensCss, getExtensionTokensCssAuto } from '../src/tokens';
import { buildPanelStyles } from '../src/features/content/in-page-panel/panelStyles';
import { buildLauncherStyles } from '../src/features/content/in-page-panel/launcher';

describe('extension panel theming', () => {
  it('emits both palettes with light behind the media query', () => {
    const css = getExtensionTokensCssAuto();
    expect(css).toContain('@media (prefers-color-scheme: light)');
    expect(css.indexOf(':root {')).toBeLessThan(css.indexOf('@media'));
    expect(css).toContain('--agi-ext-bg');
  });

  it('produces a different background per scheme', () => {
    const dark = getExtensionTokensCss('dark');
    const light = getExtensionTokensCss('light');
    const bg = (css: string) => /--agi-ext-bg:\s*([^;]+);/.exec(css)?.[1]?.trim();
    expect(bg(dark)).toBeTruthy();
    expect(bg(light)).toBeTruthy();
    expect(bg(dark)).not.toEqual(bg(light));
  });

  it('supports a shadow-DOM selector for the invite modal', () => {
    const css = getExtensionTokensCssAuto(':host');
    expect(css).toContain(':host {');
    expect(css).not.toContain(':root');
  });

  it('keeps both injected in-page surfaces responsive and theme-aware', () => {
    const panelCss = buildPanelStyles();
    const launcherCss = buildLauncherStyles();
    for (const css of [panelCss, launcherCss]) {
      expect(css).toContain('@media (prefers-color-scheme: light)');
      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
      expect(css).toContain(':host {');
    }
    expect(panelCss).toContain('width:min(380px, 100vw)');
    expect(panelCss).toContain('focus-visible');
    expect(launcherCss).toContain('background:var(--agi-ext-accent)');
  });
});

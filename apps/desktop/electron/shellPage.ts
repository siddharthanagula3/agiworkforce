import { pagePalette, titleStripHeight } from './windowChrome';

/**
 * What every page the shell draws itself shares: the palette read from the
 * design tokens, the draggable title strip, and the ink button. A `data:` page
 * follows the appearance through `prefers-color-scheme`, which
 * `nativeTheme.themeSource` keeps current, so a theme change repaints the page
 * with no call into the shell and no bridge.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paletteRules(prefersDark: boolean): string {
  const palette = pagePalette(prefersDark);
  return `--ground:${palette.background};--ink:${palette.ink};--ink-2:${palette.secondaryInk}`;
}

export function shellPaletteCss(): string {
  return `:root{${paletteRules(false)}}
  @media (prefers-color-scheme: dark){:root{${paletteRules(true)}}}`;
}

export function shellBaseCss(): string {
  return `${shellPaletteCss()}
  html,body{height:100%;margin:0}
  body{background:var(--ground);color:var(--ink);display:flex;align-items:center;justify-content:center;
    font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none}
  .strip{position:fixed;inset:0 0 auto 0;height:${titleStripHeight()}px;-webkit-app-region:drag}
  main{display:flex;flex-direction:column;align-items:center;gap:24px;padding:0 16px;text-align:center}
  h1{margin:0;font-size:24px;line-height:32px;font-weight:600;letter-spacing:-.01em}
  .actions{display:flex;flex-direction:column;align-items:center;gap:8px}
  button{-webkit-app-region:no-drag;min-height:44px;min-width:200px;padding:0 20px;border-radius:9999px;
    font:inherit;font-weight:500;cursor:pointer}
  .primary{background:var(--ink);color:var(--ground);border:0}
  .primary:hover{opacity:.88}
  .secondary{background:transparent;color:var(--ink-2);border:0}
  .secondary:hover{color:var(--ink)}
  button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}`;
}

export const SHELL_STRIP_HTML = '<div class="strip"></div>';

export function shellDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The sidebar lives directly above native VS Code views, so its surfaces and
 * text follow the host theme while AGI tokens remain complete fallbacks. The
 * previous fixed-dark policy made the extension look split in light and
 * high-contrast themes.
 *
 * Stateful pairs must still come from one family. Compositing a host warning
 * background with fixed near-white text once produced about 1.10:1 contrast in
 * Light+, even though each token was reasonable in isolation.
 */
const source = readFileSync(
  resolve(import.meta.dirname, '../features/sidebar-webview/webviewContent.ts'),
  'utf8',
);

const AGI_FAMILY = /--(bg|text|border|agi-vscode|accent)/;

function mixedRules(): string[] {
  const offenders: string[] = [];
  const rulePattern = /([.#][\w\-.,:#>[\]() \n]*?)\{([^{}]*)\}/g;
  for (const match of source.matchAll(rulePattern)) {
    const [, selector = '', body = ''] = match;
    const background = /background(?:-color)?:\s*([^;]+);/.exec(body)?.[1];
    const foreground = /(?<!-)\bcolor:\s*([^;]+);/.exec(body)?.[1];
    if (!background || !foreground) continue;

    const bgHost = background.includes('--vscode-');
    const fgHost = foreground.includes('--vscode-');
    const bgAgi = AGI_FAMILY.test(background);
    const fgAgi = AGI_FAMILY.test(foreground);

    if ((bgHost && fgAgi && !fgHost) || (fgHost && bgAgi && !bgHost)) {
      offenders.push(selector.trim().replace(/\s+/g, ' '));
    }
  }
  return offenders;
}

describe('sidebar panel palette', () => {
  it('never pairs a host-themed colour with a fixed-palette one in the same rule', () => {
    expect(
      mixedRules(),
      'These rules mix a direct host token with an AGI-only token. Use the shared ' +
        'host/fallback aliases so foreground and background change together.',
    ).toEqual([]);
  });

  it('states the colour policy truthfully in its own header', () => {
    const header = source.slice(0, source.indexOf('export function getWebviewContent'));
    expect(header).toMatch(
      /surfaces,\s*text, controls, focus, and state colours follow the host theme/i,
    );
    expect(header).toMatch(/terra brand accent (?:is|are) AGI-owned/i);
    expect(header).toMatch(/agiVsCodeCssVars.*fallback/i);
    expect(header).toMatch(/same family/i);
  });

  it('defines host-themed surface and text aliases with AGI fallbacks', () => {
    expect(source).toContain('--bg-base: var(--vscode-sideBar-background, var(--agi-vscode-bg));');
    expect(source).toContain('--text-primary: var(--vscode-foreground, var(--agi-vscode-text));');
    expect(source).toContain(
      '--warning-bg: var(--vscode-inputValidation-warningBackground, var(--agi-vscode-warning-bg));',
    );
    expect(source).toContain(
      '--button-text: var(--vscode-button-foreground, var(--agi-vscode-button-text));',
    );
  });
});

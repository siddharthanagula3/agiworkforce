import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The sidebar panel uses a FIXED palette by founder decision (2026-07-27, see
 * packages/ui/design-tokens/src/index.ts) so it looks identical across VS Code,
 * Cursor, Windsurf and Antigravity.
 *
 * That decision is only safe if it is applied consistently. Compositing a
 * host-themed colour onto a fixed-palette surface — or the reverse — produces
 * pairings nobody chose: the runtime banner rendered #ececec text on Light+'s
 * pale-yellow warning background at about 1.10:1, and hovering a composer chip
 * put near-white on a light grey. Each side of a pairing is defensible alone;
 * together they are unreadable.
 *
 * This asserts the invariant rather than any particular colour: within one rule,
 * background and foreground must come from the SAME family.
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
      'These rules mix --vscode-* with the fixed panel palette. Pick one family per rule: ' +
        'the panel is deliberately fixed-dark, so pin BOTH sides to --agi-vscode-* / --bg-* / --text-*.',
    ).toEqual([]);
  });

  it('states the colour policy truthfully in its own header', () => {
    // Asserted POSITIVELY. A "must not contain <phrase>" check is fragile in the
    // obvious way: it fires on the header quoting the old wording to explain why
    // it was wrong. What matters is that the header says what the tokens do.
    const header = source.slice(0, source.indexOf('export function getWebviewContent'));
    expect(header).toMatch(/does NOT follow the host theme/i);
    expect(header).toMatch(/fixed dark palette/i);
    // And that the rule the policy implies is written down where it is needed.
    expect(header).toMatch(/same family/i);
  });
});

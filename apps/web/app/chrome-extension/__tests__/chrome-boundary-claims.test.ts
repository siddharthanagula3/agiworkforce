import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Claim guard for /chrome-extension, the page that describes where extension
 * traffic goes.
 *
 * The page sold a single boundary — capture in the browser, execute on
 * Desktop, nothing else leaves — while
 * apps/extension/src/features/computer-use/cloudAgentClient.ts posts the whole
 * conversation, screenshots included, to the Managed Cloud gateway under the
 * user's account token. The absolutes are banned as patterns rather than as
 * quoted copy so they trip on the words a future writer types, and the honest
 * exception is required in each of the four places the old claim lived: hero,
 * architecture steps, capabilities, and the boundary ledger.
 *
 * Cross-page rules keep the wording consistent with /agent-permissions, which
 * is where the residual screenshot risk is written out in full.
 */

const CHROME_PAGE = path.join(path.resolve(__dirname, '..'), 'page.tsx');
const PERMISSIONS_PAGE = path.join(
  path.resolve(__dirname, '..', '..'),
  'agent-permissions',
  'page.tsx',
);

function rendered(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

function chromeSource(): string {
  return rendered(CHROME_PAGE);
}

function collapsed(): string {
  return chromeSource().replace(/\s+/gu, ' ');
}

function constBlock(name: string): string {
  const block = new RegExp(`const ${name}[^=]*= \\[([\\s\\S]*?)\\n\\];`, 'u').exec(chromeSource());
  expect(block, `${name} not found`).not.toBeNull();
  return block![1]!.replace(/\s+/gu, ' ');
}

function heroLede(): string {
  const lede = /className="agi-fl-lede">([\s\S]*?)<\/p>/u.exec(chromeSource());
  expect(lede).not.toBeNull();
  return lede![1]!.replace(/\s+/gu, ' ');
}

const BANNED_ABSOLUTES: ReadonlyArray<readonly [string, RegExp]> = [
  ['no model traffic in the browser', /no model traffic in the browser/iu],
  ['no inference in the browser', /no inference[^.]*browser/iu],
  [
    'execution and keys stay on your machine',
    /execution, models,? and keys stay on your machine/iu,
  ],
  ['everything stays on your machine', /(everything|nothing) (stays|leaves) your machine/iu],
  ['unqualified desktop execution', /models and tools run on desktop\./iu],
  ['every job crosses the bridge', /hands (every job|the work|all work)/iu],
  ['keys never leave desktop', /keys never leave (your )?desktop/iu],
];

describe('/chrome-extension — transmission claims', () => {
  it('makes none of the absolute boundary claims the extension breaks', () => {
    const source = collapsed();
    for (const [label, pattern] of BANNED_ABSOLUTES) {
      expect(pattern.test(source), `page still claims: ${label}`).toBe(false);
    }
  });

  it('names the Managed Cloud gateway as the destination reached from the extension', () => {
    const source = collapsed();
    expect(source).toMatch(/Managed Cloud gateway/u);
    expect(source).toMatch(/directly from the extension/iu);
  });

  it('says the conversation and the screenshots are what leave', () => {
    const source = collapsed();
    expect(source).toMatch(/conversation/iu);
    expect(source).toMatch(/screenshots?/iu);
    expect(source).toMatch(/account token/iu);
  });

  it('carries the exception in the hero, not only in the fine print', () => {
    expect(heroLede()).toMatch(/computer use/iu);
    expect(heroLede()).toMatch(/Managed Cloud/u);
  });

  it('carries the exception in the architecture steps', () => {
    const steps = constBlock('ARCHITECTURE_STEPS');
    expect(steps).toMatch(/Managed Cloud/u);
    expect(steps).toMatch(/screenshot/iu);
  });

  it('carries the exception in the capabilities grid', () => {
    const capabilities = constBlock('CAPABILITIES');
    expect(capabilities).toMatch(/computer use/iu);
    expect(capabilities).toMatch(/Managed Cloud/u);
  });

  it('carries an egress row in the boundary ledger', () => {
    const ledger = constBlock('BOUNDARY_LEDGER');
    expect(ledger).toMatch(/Computer-use egress/u);
    expect(ledger).toMatch(/screenshot/iu);
    expect(ledger).toMatch(/Managed Cloud gateway/u);
  });

  it('scopes the Desktop key claim to Desktop', () => {
    const ledger = constBlock('BOUNDARY_LEDGER');
    const keys = /k: 'Keys in Chrome',\s*v:\s*'((?:[^'\\]|\\.)*)'/u.exec(ledger);
    expect(keys).not.toBeNull();
    expect(keys![1]!).toMatch(/computer use/iu);
  });

  it('sends the reader to the page that details the residual screenshot risk', () => {
    expect(collapsed()).toMatch(/href="\/agent-permissions"/u);
  });
});

describe('/chrome-extension — consistency with /agent-permissions', () => {
  it('agrees with the permissions page on where computer-use inference happens', () => {
    const permissions = rendered(PERMISSIONS_PAGE).replace(/\s+/gu, ' ');
    expect(permissions).toMatch(/Managed Cloud gateway/u);
    expect(permissions).toMatch(/directly from the extension/iu);
    expect(collapsed()).toMatch(/Managed Cloud gateway/u);
  });

  it('does not soften the screenshot risk the permissions page states plainly', () => {
    const permissions = rendered(PERMISSIONS_PAGE).replace(/\s+/gu, ' ');
    expect(permissions).toMatch(/not redacted and cannot be/iu);
    expect(collapsed()).toMatch(/not redacted and cannot be/iu);
  });
});

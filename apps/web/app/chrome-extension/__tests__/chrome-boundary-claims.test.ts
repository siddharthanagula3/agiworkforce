import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRIVACY_MODE_DISPLAY } from '@agiworkforce/types';

const CLOUD = PRIVACY_MODE_DISPLAY.managed.label;

/**
 * Claim guard for /chrome-extension, the page that describes where extension
 * traffic goes.
 *
 * The page sold a single boundary, capture in the browser, execute on
 * Desktop, nothing else leaves, while
 * apps/extension/src/features/computer-use/cloudAgentClient.ts posts the whole
 * conversation, screenshots included, to the Managed Cloud gateway under the
 * user's account token. The absolutes are banned as patterns rather than as
 * quoted copy so they trip on the words a future writer types, and the honest
 * exception is required in each of the four places the page explains it: architecture,
 * destinations grid, capabilities, and the boundary ledger.
 *
 * Cross-page rules keep the wording consistent with /agent-permissions, which
 * is where the residual screenshot risk is written out in full.
 *
 * The page now composes the flagship sections, so its copy lives in the three
 * module consts the sections map over plus the architecture introduction. The
 * helpers read those regions; a rename of a const is a deliberate edit and
 * should fail here rather than let a region go unchecked.
 *
 * Chat is banned from being sold as a Desktop job as well. The bridge carries
 * selections, captures and queued messages; every answer comes from
 * apps/extension/src/features/cloud-bridge/freeTrialClient.ts, which posts to
 * the Managed Cloud chat endpoint under the signed-in account token.
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

function copyBlock(name: string): string {
  const block = new RegExp(`const ${name} = \\[[\\s\\S]*?\\n\\];`, 'u').exec(chromeSource());
  expect(block, `copy block ${name} not found`).not.toBeNull();
  return block![0]!.replace(/\s+/gu, ' ');
}

function architectureLede(): string {
  const section =
    /<section[^>]*aria-labelledby="agi-fl-chrome-arch-title">([\s\S]*?)<\/section>/u.exec(
      chromeSource(),
    );
  expect(section, 'architecture section not found').not.toBeNull();
  const lede = /className="agi-fl-section-lede">([\s\S]*?)<\/p>/u.exec(section![1]!);
  expect(lede, 'architecture introduction not found').not.toBeNull();
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
  ['chat executes on desktop', /chat (models )?(and tools )?runs? on desktop/iu],
  ['chat is handed to desktop', /hands chat to (agi )?desktop/iu],
];

describe('/chrome-extension, transmission claims', () => {
  it('makes none of the absolute boundary claims the extension breaks', () => {
    const source = collapsed();
    for (const [label, pattern] of BANNED_ABSOLUTES) {
      expect(pattern.test(source), `page still claims: ${label}`).toBe(false);
    }
  });

  it('does not equate site automation approval with explicit page attachment', () => {
    expect(collapsed()).not.toMatch(/unapproved origin[^.]*no page text/iu);
  });

  it('does not promise that every site permission expires with a task', () => {
    expect(collapsed()).not.toMatch(/scoped task permissions|permissions scoped to the task/iu);
  });

  it('describes the site controls the extension has, not permission profiles', () => {
    const capabilities = copyBlock('CAPABILITIES');
    expect(capabilities).not.toMatch(/permission profiles?/iu);
    expect(capabilities).not.toMatch(/allowed actions/iu);
    expect(capabilities).not.toMatch(/expiry/iu);
    expect(capabilities).toMatch(/list of approved sites/iu);
    expect(capabilities).toMatch(/single task/iu);
    expect(capabilities).toMatch(/Removing a site ends its access/u);
  });

  it(`names the ${CLOUD} gateway as the destination reached from the extension`, () => {
    const source = collapsed();
    expect(source).toMatch(new RegExp(`${CLOUD} gateway`, 'u'));
    expect(source).toMatch(/directly from the extension/iu);
  });

  it('says the conversation and the screenshots are what leave', () => {
    const source = collapsed();
    expect(source).toMatch(/conversation/iu);
    expect(source).toMatch(/screenshots?/iu);
    expect(source).toMatch(/account token/iu);
  });

  it(`states the screenshot and ${CLOUD} boundary in the architecture introduction`, () => {
    const introduction = architectureLede();
    expect(introduction).toMatch(/computer use/iu);
    expect(introduction).toMatch(new RegExp(`${CLOUD}`, 'u'));
    expect(introduction).toMatch(/screenshots/iu);
    expect(introduction).toMatch(/never stores provider keys/iu);
  });

  it('carries the exception where the page names its destinations', () => {
    const destinations = copyBlock('ARCHITECTURE_STEPS');
    expect(destinations).toMatch(new RegExp(`${CLOUD}`, 'u'));
    expect(destinations).toMatch(/screenshot/iu);
  });

  it('carries the exception in the capabilities grid', () => {
    const capabilities = copyBlock('CAPABILITIES');
    expect(capabilities).toMatch(/computer use/iu);
    expect(capabilities).toMatch(new RegExp(`${CLOUD}`, 'u'));
  });

  it('carries an egress row in the boundary ledger', () => {
    const ledger = copyBlock('BOUNDARY_LEDGER');
    expect(ledger).toMatch(/Computer-use egress/u);
    expect(ledger).toMatch(/screenshot/iu);
    expect(ledger).toMatch(new RegExp(`${CLOUD} gateway`, 'u'));
  });

  it('scopes the Desktop key claim to Desktop', () => {
    const ledger = copyBlock('BOUNDARY_LEDGER');
    const keys = /k: 'Keys in Chrome',\s*v:\s*'((?:[^'\\]|\\.)*)'/u.exec(ledger);
    expect(keys, 'Keys in Chrome row not found').not.toBeNull();
    expect(keys![1]!).toMatch(/computer use/iu);
  });

  it(`names ${CLOUD} as the chat destination, not the Desktop bridge`, () => {
    const destinations = copyBlock('ARCHITECTURE_STEPS');
    expect(destinations).toMatch(new RegExp(`${CLOUD}`, 'u'));
    const ledger = copyBlock('BOUNDARY_LEDGER');
    const inference = /k: 'Inference in Chrome',\s*v:\s*'((?:[^'\\]|\\.)*)'/u.exec(ledger);
    expect(inference, 'Inference in Chrome row not found').not.toBeNull();
    expect(inference![1]!).toMatch(new RegExp(`${CLOUD}`, 'u'));
  });

  it('keeps native messaging apart from the loopback pairing port', () => {
    const source = collapsed();
    expect(source).not.toMatch(/native messaging[^.'`]*localhost port/iu);
    expect(source).not.toMatch(/\b8787\b/u);
    expect(source).toMatch(/Pairing runs over loopback[^.]*\$\{BROWSER_BRIDGE_DEFAULT_PORT\}/u);
  });

  it('sends the reader to the page that details the residual screenshot risk', () => {
    expect(collapsed()).toMatch(/href="\/agent-permissions"/u);
  });
});

describe('/chrome-extension, consistency with /agent-permissions', () => {
  it('agrees with the permissions page on where computer-use inference happens', () => {
    const permissions = rendered(PERMISSIONS_PAGE).replace(/\s+/gu, ' ');
    expect(permissions).toMatch(new RegExp(`${CLOUD} gateway`, 'u'));
    expect(permissions).toMatch(/directly from the extension/iu);
    expect(collapsed()).toMatch(new RegExp(`${CLOUD} gateway`, 'u'));
  });

  it('does not soften the screenshot risk the permissions page states plainly', () => {
    const permissions = rendered(PERMISSIONS_PAGE).replace(/\s+/gu, ' ');
    expect(permissions).toMatch(/not redacted and cannot be/iu);
    expect(collapsed()).toMatch(/not redacted and cannot be/iu);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QUICK_START_INTENTS, QUICK_START_INTENT_COPY } from '@agiworkforce/types';

/**
 * Cross-surface guard for the FIRST screen of the product.
 *
 * Three surfaces greet a user with an empty chat, and each shipped its own set
 * of starting points:
 *
 *   web      Code · Write · Learn · Life stuff · AGI's pick
 *   desktop  Code · Write · Research · Image · Video · Computer
 *   mobile   SwiftUI Auth · Summarize PDF · Tokyo Itinerary · Startup Pitch ·
 *            SQL → Explanation · Debug This Error
 *
 * Two of those sets barely overlap and the third describes a different product
 * entirely, so what AGI appeared to *be* depended on where you opened it.
 *
 * They now share QUICK_START_INTENT_COPY. The ACTIONS still differ by surface,
 * deliberately — web prefills its composer, desktop toggles a mode in the
 * unified-chat store, mobile opens a new conversation — because web and
 * unified-chat keep separate chat stores. Sharing the component instead of the
 * vocabulary would give web a chip that toggles a store it never reads.
 *
 * This test therefore guards the words, which is the part that must not drift,
 * and stays silent about the interaction, which is allowed to differ. It reads
 * source text rather than rendering, so it holds for React Native and the
 * Electron shell without a DOM.
 */

const repoRoot = resolve(import.meta.dirname, '../../../..');

const SURFACES = [
  {
    name: 'web greeting',
    path: 'apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx',
  },
  {
    name: 'desktop quick chips',
    path: 'packages/ui/unified-chat/src/components/QuickChips.tsx',
  },
  {
    name: 'mobile starters',
    path: 'apps/mobile/src/features/chat/components/ConversationStarters.tsx',
  },
] as const;

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

/**
 * Strip comments before scanning for retired labels.
 *
 * Each of these files explains in a docblock which labels it replaced and why —
 * that history is worth keeping, and an absence assertion that fires on its own
 * documentation would push the next person to delete the explanation instead of
 * the hardcoded string.
 */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** Labels the surfaces used to invent locally, in any of the three sets. */
const RETIRED_LABELS = [
  'Life stuff',
  "AGI's pick",
  'SwiftUI Auth',
  'Summarize PDF',
  'Tokyo Itinerary',
  'Startup Pitch',
  'Debug This Error',
];

describe('empty-chat vocabulary', () => {
  it.each(SURFACES)('$name derives its labels from the shared vocabulary', ({ path }) => {
    const source = read(path);
    expect(source).toMatch(/@agiworkforce\/types/);
    expect(source).toMatch(/QUICK_START_INTENT|quickStartIntentLabel/);
  });

  it.each(SURFACES)('$name no longer hardcodes a retired label', ({ path }) => {
    const source = code(path);
    for (const label of RETIRED_LABELS) {
      expect(source, `${path} still hardcodes "${label}"`).not.toContain(`'${label}'`);
      expect(source, `${path} still hardcodes "${label}"`).not.toContain(`"${label}"`);
    }
  });

  it('offers the same six intents in the same order everywhere', () => {
    // The order is part of the vocabulary: "Code" first on one surface and
    // fourth on another is the same drift in a subtler form.
    expect(QUICK_START_INTENTS).toEqual([
      'code',
      'write',
      'research',
      'image',
      'video',
      'computer',
    ]);
  });

  it('gives every intent copy a surface can render', () => {
    for (const intent of QUICK_START_INTENTS) {
      const copy = QUICK_START_INTENT_COPY[intent];
      expect(copy.label.trim()).not.toBe('');
      expect(copy.prompt.trim()).not.toBe('');
      // Mobile shows accessibleLabel as the card's description line, so it has
      // to read as a phrase rather than repeat the one-word label.
      expect(copy.accessibleLabel.length).toBeGreaterThan(copy.label.length);
    }
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(__dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

const page = readFileSync(join(__dirname, 'page.tsx'), 'utf8').replace(/\s+/gu, ' ');
const recall = readFileSync(
  join(WEB_ROOT, 'lib/services/managed-memory-context-service.ts'),
  'utf8',
);
const editor = readFileSync(
  join(REPO_ROOT, 'packages/ui/unified-chat/src/components/MemoryEditor.tsx'),
  'utf8',
);
const importDialog = readFileSync(
  join(WEB_ROOT, 'features/settings/components/ImportMemoryDialog.tsx'),
  'utf8',
).replace(/\s+/gu, ' ');

const NUMBER_WORDS: Record<number, string> = {
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
};

function constant(source: string, name: string): number {
  const match = new RegExp(`const ${name} = ([\\d_]+);`, 'u').exec(source);
  if (!match) throw new Error(`${name} is no longer a numeric constant in its source file`);
  return Number(match[1]!.replace(/_/gu, ''));
}

describe('/features/memory states the limits the code enforces', () => {
  it('prints the recall cap and character budget of managed cloud', () => {
    const facts = constant(recall, 'MAX_MEMORIES');
    const characters = constant(recall, 'MAX_TOTAL_MEMORY_CHARS');

    expect(page).toContain(
      `Up to ${facts} facts on AGI managed cloud, capped at ${characters.toLocaleString('en-US')} characters in total.`,
    );
  });

  it('prints how many facts one chat turn can add', () => {
    const perTurn = constant(recall, 'MAX_AUTO_MEMORIES_PER_TURN');
    const word = NUMBER_WORDS[perTurn];

    expect(word, `no word for ${perTurn}`).toBeDefined();
    expect(page).toContain(`A single chat turn can add at most ${word} new facts.`);
  });

  it('prints the length the add box accepts', () => {
    expect(page).toContain(
      `A box above the list takes up to ${constant(editor, 'MAX_FACT_CHARS')} characters.`,
    );
  });

  it('states no limit for a surface that is not released', () => {
    expect(page).not.toMatch(/\d+ on mobile/iu);
    expect(page).not.toMatch(/On mobile,/u);
  });

  it('describes the import the web settings pane offers', () => {
    expect(importDialog).toContain(
      'Paste memories exported from another assistant, or upload a text or JSON file. Review what was found before anything is saved.',
    );
    expect(page).toContain(
      'Paste memories exported from another assistant, or upload a text or JSON file. You review what was found before anything is saved',
    );
  });
});

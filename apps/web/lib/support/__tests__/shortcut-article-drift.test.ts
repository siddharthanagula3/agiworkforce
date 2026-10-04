import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  KEYBOARD_SHORTCUT_DOCS,
  formatShortcutKeys,
} from '@/features/chat/hooks/use-keyboard-shortcuts';

const ARTICLE = readFileSync(
  path.join(__dirname, '..', '..', '..', 'content', 'support', 'keyboard-shortcuts.md'),
  'utf8',
);

function articleRows() {
  return ARTICLE.split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim()),
    )
    .filter((cells) => cells.length === 2 && !/^-+$/.test(cells[0] ?? ''))
    .slice(1);
}

function keySet(keys: string) {
  return keys.split('+').sort();
}

describe('keyboard shortcuts help article', () => {
  it('lists exactly the registered shortcuts with the same keys and descriptions', () => {
    const rows = articleRows();
    expect(rows).toHaveLength(KEYBOARD_SHORTCUT_DOCS.length);
    for (const doc of KEYBOARD_SHORTCUT_DOCS) {
      const row = rows.find(([, description]) => description === doc.description);
      expect(row, `no article row for "${doc.description}"`).toBeDefined();
      expect(keySet(row?.[0] ?? '')).toEqual(keySet(formatShortcutKeys(doc, false).join('+')));
    }
  });
});

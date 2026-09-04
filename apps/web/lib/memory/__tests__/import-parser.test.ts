import { describe, expect, it } from 'vitest';
import {
  IMPORT_SOURCE_PREFIX,
  ImportTextTooLargeError,
  MAX_IMPORT_ITEM_CHARS,
  MAX_IMPORT_ITEMS,
  MAX_IMPORT_TEXT_CHARS,
  buildImportPreview,
  importSourceDisplayName,
  importSourceValue,
  normalizeImportSourceName,
  normalizeMemoryKey,
  parseImportedMemoryText,
} from '../import-parser';

describe('parseImportedMemoryText: plain line lists', () => {
  it('splits one memory per line', () => {
    const result = parseImportedMemoryText('Likes dark mode\nPrefers Python\nWorks in Berlin');
    expect(result.format).toBe('text');
    expect(result.items).toEqual(['Likes dark mode', 'Prefers Python', 'Works in Berlin']);
  });

  it('trims whitespace around each line', () => {
    const result = parseImportedMemoryText('  Likes tea  \n\t Prefers dark roast \t');
    expect(result.items).toEqual(['Likes tea', 'Prefers dark roast']);
  });

  it('skips empty lines', () => {
    const result = parseImportedMemoryText('First fact\n\n\nSecond fact\n   \n');
    expect(result.items).toEqual(['First fact', 'Second fact']);
  });
});

describe('parseImportedMemoryText: bullet and numbered lists', () => {
  it('strips a leading hyphen bullet', () => {
    const result = parseImportedMemoryText('- Likes dark mode\n- Prefers Python');
    expect(result.items).toEqual(['Likes dark mode', 'Prefers Python']);
  });

  it('strips asterisk and bullet-character markers', () => {
    const result = parseImportedMemoryText('* Likes dark mode\n• Prefers Python');
    expect(result.items).toEqual(['Likes dark mode', 'Prefers Python']);
  });

  it('strips numbered markers with a dot or a paren', () => {
    const result = parseImportedMemoryText('1. Likes dark mode\n2) Prefers Python\n12. Third item');
    expect(result.items).toEqual(['Likes dark mode', 'Prefers Python', 'Third item']);
  });
});

describe('parseImportedMemoryText: JSON arrays', () => {
  it('accepts an array of strings', () => {
    const result = parseImportedMemoryText(JSON.stringify(['Likes dark mode', 'Prefers Python']));
    expect(result.format).toBe('json');
    expect(result.items).toEqual(['Likes dark mode', 'Prefers Python']);
  });

  it('accepts objects with a text field', () => {
    const result = parseImportedMemoryText(JSON.stringify([{ text: 'Likes dark mode' }]));
    expect(result.format).toBe('json');
    expect(result.items).toEqual(['Likes dark mode']);
  });

  it('accepts objects with a content field', () => {
    const result = parseImportedMemoryText(JSON.stringify([{ content: 'Prefers Python' }]));
    expect(result.items).toEqual(['Prefers Python']);
  });

  it('prefers text over content when both are present', () => {
    const result = parseImportedMemoryText(
      JSON.stringify([{ text: 'from text', content: 'from content' }]),
    );
    expect(result.items).toEqual(['from text']);
  });

  it('skips array entries with neither a usable string nor a text/content field', () => {
    const result = parseImportedMemoryText(
      JSON.stringify(['keep me', 42, null, { other: 'ignored' }, { text: 'also keep' }]),
    );
    expect(result.items).toEqual(['keep me', 'also keep']);
  });

  it('falls back to text parsing when JSON does not parse to an array', () => {
    const result = parseImportedMemoryText('{"not": "an array"}');
    expect(result.format).toBe('text');
    expect(result.items).toEqual(['{"not": "an array"}']);
  });

  it('falls back to text parsing on invalid JSON that looks array-like', () => {
    const result = parseImportedMemoryText('[Likes dark mode, Prefers Python]');
    expect(result.format).toBe('text');
    expect(result.items).toEqual(['[Likes dark mode, Prefers Python]']);
  });
});

describe('parseImportedMemoryText: dedupe within the paste', () => {
  it('drops a case-insensitive repeat and keeps the first occurrence', () => {
    const result = parseImportedMemoryText('Likes dark mode\nLIKES DARK MODE\nlikes dark mode');
    expect(result.items).toEqual(['Likes dark mode']);
  });

  it('collapses internal whitespace differences before comparing', () => {
    const result = parseImportedMemoryText('Likes   dark mode\nLikes dark  mode');
    expect(result.items).toEqual(['Likes   dark mode']);
  });

  it('dedupes JSON array entries the same way', () => {
    const result = parseImportedMemoryText(JSON.stringify(['Same fact', 'same fact']));
    expect(result.items).toEqual(['Same fact']);
  });
});

describe('parseImportedMemoryText: size limits', () => {
  it('throws when the raw text exceeds the character ceiling', () => {
    const oversized = 'a'.repeat(MAX_IMPORT_TEXT_CHARS + 1);
    expect(() => parseImportedMemoryText(oversized)).toThrow(ImportTextTooLargeError);
  });

  it('accepts text at exactly the ceiling', () => {
    const atLimit = 'a'.repeat(MAX_IMPORT_TEXT_CHARS);
    expect(() => parseImportedMemoryText(atLimit)).not.toThrow();
  });

  it('truncates an over-long item and marks it clamped', () => {
    const longLine = 'x'.repeat(MAX_IMPORT_ITEM_CHARS + 50);
    const result = parseImportedMemoryText(longLine);
    expect(result.items[0]).toHaveLength(MAX_IMPORT_ITEM_CHARS);
    expect(result.items[0]?.endsWith('…')).toBe(true);
  });

  it('caps the number of items and reports truncation', () => {
    const lines = Array.from({ length: MAX_IMPORT_ITEMS + 20 }, (_, i) => `fact number ${i}`);
    const result = parseImportedMemoryText(lines.join('\n'));
    expect(result.items).toHaveLength(MAX_IMPORT_ITEMS);
    expect(result.totalCandidates).toBe(MAX_IMPORT_ITEMS + 20);
    expect(result.itemsTruncated).toBe(true);
  });

  it('does not report truncation when under the item cap', () => {
    const result = parseImportedMemoryText('one\ntwo\nthree');
    expect(result.itemsTruncated).toBe(false);
    expect(result.totalCandidates).toBe(3);
  });
});

describe('normalizeMemoryKey', () => {
  it('trims, lowercases, and collapses whitespace', () => {
    expect(normalizeMemoryKey('  Likes   Dark\tMode  ')).toBe('likes dark mode');
  });
});

describe('buildImportPreview', () => {
  it('flags items whose normalized key already exists', () => {
    const preview = buildImportPreview(
      ['Likes dark mode', 'Prefers Python'],
      new Set(['likes dark mode']),
    );
    expect(preview).toEqual([
      { content: 'Likes dark mode', normalizedKey: 'likes dark mode', duplicate: true },
      { content: 'Prefers Python', normalizedKey: 'prefers python', duplicate: false },
    ]);
  });

  it('marks nothing as a duplicate when the existing set is empty', () => {
    const preview = buildImportPreview(['A fact'], new Set());
    expect(preview.every((item) => item.duplicate === false)).toBe(true);
  });
});

describe('normalizeImportSourceName', () => {
  it('trims and bounds the length', () => {
    expect(normalizeImportSourceName('  ChatGPT  ')).toBe('ChatGPT');
    expect(normalizeImportSourceName('x'.repeat(200))).toHaveLength(60);
  });

  it('falls back to "Other" for an empty name', () => {
    expect(normalizeImportSourceName('   ')).toBe('Other');
  });
});

describe('importSourceValue and importSourceDisplayName round trip', () => {
  it('round trips known providers', () => {
    for (const name of ['ChatGPT', 'Claude', 'Gemini', 'Copilot']) {
      const value = importSourceValue(name);
      expect(value.startsWith(IMPORT_SOURCE_PREFIX)).toBe(true);
      expect(importSourceDisplayName(value)).toBe(
        { ChatGPT: 'ChatGPT', Claude: 'Claude', Gemini: 'Gemini', Copilot: 'Copilot' }[name],
      );
    }
  });

  it('slugifies an arbitrary source name and title-cases it back', () => {
    const value = importSourceValue('My Custom Assistant!');
    expect(value).toBe('imported:my-custom-assistant');
    expect(importSourceDisplayName(value)).toBe('My Custom Assistant');
  });

  it('returns null for a source that was not imported', () => {
    expect(importSourceDisplayName('web')).toBeNull();
    expect(importSourceDisplayName('auto')).toBeNull();
    expect(importSourceDisplayName(null)).toBeNull();
    expect(importSourceDisplayName(undefined)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

const EM_DASH = String.fromCodePoint(0x2014);

import {
  MAX_DESCRIPTION_LENGTH,
  fallbackDescription,
  selectDescriptionSource,
  summarizeDescription,
} from '@/lib/connectors/directory/summary';

const NAME = 'Weather';
const CATEGORY = 'Data';

function summarize(raw: string): string {
  return summarizeDescription(raw, NAME, CATEGORY);
}

describe('summarizeDescription', () => {
  it('keeps only the first sentence', () => {
    expect(summarize('Search issues in Linear. Create tickets from chat.')).toBe(
      'Search issues in Linear.',
    );
  });

  it('does not split on a digit, an initial, or a known abbreviation', () => {
    expect(summarize('Intelligent MCP server for Godot 4. Spatial intelligence.')).toBe(
      'Intelligent MCP server for Godot 4.',
    );
    expect(summarize('St. Louis County GIS data. Open geospatial layers.')).toBe(
      'St. Louis County GIS data.',
    );
    expect(summarize('Works with e.g. Cursor tools. Next step.')).toBe(
      'Works with e.g. Cursor tools.',
    );
    expect(summarize('Essays by S. Araba Lawson. Read-only.')).toBe('Essays by S. Araba Lawson.');
  });

  it('extends a fragment first sentence with the next one', () => {
    expect(
      summarize(
        'Dedicated IDE Edition. Persistent project context for Cursor, Windsurf, Cline, VS Code.',
      ),
    ).toBe(
      'Dedicated IDE Edition. Persistent project context for Cursor, Windsurf, Cline, VS Code.',
    );
    expect(summarize('Fast. Simple. Search issues in Linear.')).toBe(
      'Fast. Simple. Search issues in Linear.',
    );
  });

  it('strips markdown, html, code and images', () => {
    expect(summarize('**Bold** [link](https://x.y/z) `code` ![img](https://x.y/i.png)')).toBe(
      'Bold link code.',
    );
    expect(summarize('<b>Bold</b> text')).toBe('Bold text.');
    expect(summarize('- item one\n- item two')).toBe('Item one item two.');
  });

  it('removes urls and emoji', () => {
    expect(summarize('Weather forecasts over MCP. See https://example.com')).toBe(
      'Weather forecasts over MCP.',
    );
    expect(summarize('🚀 Deploy fast 🎉')).toBe('Deploy fast.');
  });

  it('replaces em dashes, including mojibake, with a comma', () => {
    expect(summarize(`Fast ${EM_DASH} simple`)).toBe('Fast, simple.');
    expect(summarize('Fast â€” simple')).toBe('Fast, simple.');
  });

  it('capitalises and terminates the sentence', () => {
    expect(summarize('search issues')).toBe('Search issues.');
    expect(summarize('Search issues!')).toBe('Search issues!');
    expect(summarize('Search issues (beta)')).toBe('Search issues (beta)');
  });

  it('bounds the sentence at the maximum length on a clause or word boundary', () => {
    const long =
      'Every Tactical RMM endpoint as a typed command, plus an offline SQLite mirror and cross-entity joins that answer the questions the vendor console cannot.';
    const result = summarize(long);
    expect(result.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    expect(result.endsWith('…')).toBe(true);
    const kept = result.slice(0, -1);
    expect(long.startsWith(kept)).toBe(true);
    expect(long.charAt(kept.length)).toBe(' ');
    expect(kept.length).toBeGreaterThan(MAX_DESCRIPTION_LENGTH / 2);
  });

  it('cuts at the last clause boundary when one sits in the second half', () => {
    const long =
      'Every KnowBe4 KMSAT reporting feature plus a local SQLite store, cross-client answers, weekly digests, and export to any warehouse you already run.';
    expect(summarize(long)).toBe(
      'Every KnowBe4 KMSAT reporting feature plus a local SQLite store, cross-client answers, weekly digests…',
    );
  });

  it('falls back to a neutral sentence when the source is empty or noise', () => {
    expect(summarize('')).toBe('Weather is a connector for data and search.');
    expect(summarize('---')).toBe('Weather is a connector for data and search.');
    expect(summarize('https://example.com')).toBe('Weather is a connector for data and search.');
  });

  it('falls back for scaffold and payload descriptions', () => {
    expect(summarize('Description of my MCP server')).toBe(
      'Weather is a connector for data and search.',
    );
    expect(summarize('An MCP server that provides [describe what your server does]')).toBe(
      'Weather is a connector for data and search.',
    );
    expect(summarize('{"jsonrpc":"2.0","id":1,"method":"tools/call"}')).toBe(
      'Weather is a connector for data and search.',
    );
  });
});

describe('selectDescriptionSource', () => {
  it('keeps a registry description that says more than the name', () => {
    expect(
      selectDescriptionSource('Weather forecasts over MCP.', 'Weather', 'A tagline here'),
    ).toBe('Weather forecasts over MCP.');
  });

  it('uses the title tagline when the description is empty or repeats the name', () => {
    expect(selectDescriptionSource('', 'Cathedral', 'Persistent memory for agents')).toBe(
      'Persistent memory for agents',
    );
    expect(selectDescriptionSource('Emoji MCP.', 'Emoji', 'Emoji search for chat apps')).toBe(
      'Emoji search for chat apps',
    );
    expect(
      selectDescriptionSource('Cathedral MCP Server', 'Cathedral', 'Persistent memory for agents'),
    ).toBe('Persistent memory for agents');
  });

  it('leaves nothing for the fallback when the tagline is under twenty characters', () => {
    expect(selectDescriptionSource('Emoji MCP.', 'Emoji', 'IDE Edition')).toBe('');
    expect(selectDescriptionSource('', 'Emoji', '')).toBe('');
  });
});

describe('fallbackDescription', () => {
  it('names the category phrase when the category is known', () => {
    expect(fallbackDescription('Stripe', 'Financial services')).toBe(
      'Stripe is a connector for payments and finance.',
    );
  });

  it('stays neutral for Other and unknown categories', () => {
    expect(fallbackDescription('Thing', 'Other')).toBe('Thing is a connector.');
    expect(fallbackDescription('Thing', 'Nope')).toBe('Thing is a connector.');
  });
});

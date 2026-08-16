
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);

function registryBlock(): string {
  const start = source.indexOf('const SLASH_COMMANDS: Record<string, SlashCommandMeta>');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n};', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function registryNames(): string[] {
  return Array.from(registryBlock().matchAll(/^ {2}'(\/[a-z]+)': \{$/gm)).map(
    (m) => m[1] as string,
  );
}

describe('Chrome side-panel command list drives every command surface', () => {
  it('declares the commands once', () => {
    expect(registryNames()).toEqual([
      '/summarize',
      '/tldr',
      '/explain',
      '/translate',
      '/extract',
      '/code',
    ]);
  });

  it('builds autocomplete matches directly from the registry', () => {
    expect(source).toContain('return Object.entries(SLASH_COMMANDS).filter(');
    expect(source).toContain('slashMatches = matchSlashCommands(inputEl.value)');
  });

  it('does not restore a second prompt-chip command registry', () => {
    expect(source).not.toContain("id: 'sp-prompt-chips'");
    expect(source).not.toContain('PROMPT_CHIP_COMMANDS');
  });

  it('keeps each command discoverable under the name the expander matches', () => {
    const block = registryBlock();
    for (const name of registryNames()) {
      const entry = block.slice(block.indexOf(`  '${name}': {`));
      expect(entry).toMatch(new RegExp(`^ {2}'\\${name}': \\{\\n {4}display: '\\${name}',`));
    }
  });
});

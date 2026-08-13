/**
 * One command list, two surfaces.
 *
 * The side panel exposes its page commands through the `/` autocomplete menu
 * (`matchSlashCommands`) and the submit-time expander (`expandSlashCommand`).
 * Both must continue to read the same registry; the retired prompt-chip row
 * must not reintroduce a second literal command list.
 *
 * These tests parse the real side_panel.ts source because the module has
 * build-time side effects that prevent importing it under vitest/jsdom (same
 * constraint documented in features/side-panel/onboarding.ts).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/side_panel.ts'),
  'utf8',
);

/** The `SLASH_COMMANDS` object literal, as source text. */
function registryBlock(): string {
  const start = source.indexOf('const SLASH_COMMANDS: Record<string, SlashCommandMeta>');
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf('\n};', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

/** Every command key declared in the registry, in menu order. */
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
    // matchSlashCommands offers the registry key; expandSlashCommand looks up
    // the raw submitted text. A display string that drifts from its key would
    // make the menu offer a command that cannot be expanded.
    const block = registryBlock();
    for (const name of registryNames()) {
      const entry = block.slice(block.indexOf(`  '${name}': {`));
      expect(entry).toMatch(new RegExp(`^ {2}'\\${name}': \\{\\n {4}display: '\\${name}',`));
    }
  });
});

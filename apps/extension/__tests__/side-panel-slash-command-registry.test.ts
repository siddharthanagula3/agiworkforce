/**
 * One command list, three surfaces.
 *
 * The side panel exposes its page commands three ways: the `/` autocomplete
 * menu (`matchSlashCommands`), the submit-time expander (`expandSlashCommand`),
 * and the one-tap chips under the composer. The chip row used to carry its own
 * literal array of names. A command renamed in `SLASH_COMMANDS` left a chip
 * that still sent the old string, which `expandSlashCommand` no longer matched,
 * so the panel silently posted "/extract" to the model as ordinary chat text.
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

/** Registry entries flagged to also render as a composer chip. */
function chipNames(): string[] {
  return Array.from(
    registryBlock().matchAll(/^ {2}'(\/[a-z]+)': \{(?:(?!^ {2}'\/)[\s\S])*?\n {4}chip: true,/gm),
  ).map((m) => m[1] as string);
}

/** The body of the loop that builds the chip row. */
function chipRowBlock(): string {
  const start = source.indexOf("const promptChipsRow = el('div', { id: 'sp-prompt-chips' });");
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('\n  }', start));
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

  it('every chip names a command the expander can execute', () => {
    const names = registryNames();
    const chips = chipNames();
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(names).toContain(chip);
    }
  });

  it('builds the chip row from the registry instead of a second literal list', () => {
    const block = chipRowBlock();
    // The regression: a hand-maintained array of command names next to the
    // registry that declares them.
    expect(block).not.toMatch(/for \(const \w+ of \[/);
    expect(block).toContain('for (const meta of PROMPT_CHIP_COMMANDS)');
    expect(block).toContain('const cmd = meta.display;');
    expect(source).toContain(
      'const PROMPT_CHIP_COMMANDS: SlashCommandMeta[] = Object.values(SLASH_COMMANDS).filter(',
    );
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

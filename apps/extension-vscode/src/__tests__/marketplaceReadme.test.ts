import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import manifest from '../../package.json';

const extensionRoot = path.resolve(__dirname, '../..');
const readme = fs.readFileSync(path.join(extensionRoot, 'README.md'), 'utf8');

const rendered = readme.replace(/\x3c!--[\s\S]*?-->/gu, '');

describe('Marketplace README', () => {
  it('does not render internal doc-template metadata', () => {
    expect(rendered).not.toMatch(/^Status:/mu);
    expect(rendered).not.toMatch(/^Owner role:/mu);
    expect(rendered).not.toMatch(/^Kind:/mu);
    expect(rendered).not.toMatch(/^Criticality:/mu);
    expect(rendered).not.toMatch(/^Last updated:/mu);
  });

  it('does not ship contributor-only build and verification instructions', () => {
    expect(rendered).not.toContain('pnpm --filter agi-workforce');
    expect(rendered).not.toMatch(/^##\s+Verification\s*$/mu);
    expect(rendered).not.toMatch(/^##\s+Trust boundaries\s*$/mu);
  });

  it('gives a Marketplace visitor what they need to install and start', () => {
    for (const heading of ['## Requirements', '## Quick start', '## Features', '## License']) {
      expect(rendered).toContain(heading);
    }
    expect(rendered).toContain('Activity Bar');
  });

  it('only documents settings the extension actually contributes', () => {
    const configuration = manifest.contributes.configuration as unknown as
      { properties: Record<string, unknown> } | Array<{ properties: Record<string, unknown> }>;
    const contributed = new Set(
      (Array.isArray(configuration) ? configuration : [configuration]).flatMap((section) =>
        Object.keys(section.properties),
      ),
    );

    const documented = [...new Set(readme.match(/`agiWorkforce\.[A-Za-z.]+`/gu) ?? [])].map((key) =>
      key.replaceAll('`', ''),
    );

    expect(documented.length).toBeGreaterThan(5);
    expect(documented.filter((key) => !contributed.has(key))).toEqual([]);
  });

  it('names every command exactly as the Command Palette shows it', () => {
    const titles = new Set<string>(manifest.contributes.commands.map((entry) => entry.title));
    const prefix = `${PRODUCT_NAMES.code}: `;
    const named = [
      ...new Set(
        [...rendered.matchAll(/(?<=[`*|]\s?)([A-Z][A-Za-z]*: [^`*|\n]+?)(?=\s*[`*|])/gu)]
          .map((match) => match[1] ?? '')
          .filter((label) => label.startsWith(prefix)),
      ),
    ];

    expect(named.length).toBeGreaterThan(5);
    expect(named.filter((label) => !titles.has(label))).toEqual([]);
  });

  it('links and embeds only absolute https URLs and no SVG images', () => {
    const targets = [
      ...[...rendered.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu)].map((match) => match[1] ?? ''),
      ...[...rendered.matchAll(/<(?:img|a)\b[^>]*\b(?:src|href)="([^"]+)"/giu)].map(
        (match) => match[1] ?? '',
      ),
      ...[...rendered.matchAll(/<(https?:[^>\s]+)>/gu)].map((match) => match[1] ?? ''),
    ];

    expect(targets.length).toBeGreaterThan(0);
    expect(targets.filter((target) => !target.startsWith('https://'))).toEqual([]);
    expect(targets.filter((target) => /\.svg(?:[?#]|$)/iu.test(target))).toEqual([]);
    expect(rendered).not.toMatch(/<svg\b/iu);
  });

  it('describes memory as account memory, which is where the extension stores it', () => {
    const configuration = manifest.contributes.configuration as unknown as {
      properties: Record<string, { description?: string }>;
    };
    const memorySetting =
      configuration.properties['agiWorkforce.memory.enabled']?.description ?? '';
    const workspaceOnly = /workspace memory|only in this (?:VS Code )?workspace|Memory view/iu;

    expect(rendered).not.toMatch(workspaceOnly);
    expect(memorySetting).not.toMatch(workspaceOnly);
    expect(memorySetting).toContain('AGI account');
  });

  it('keeps the relocated contributor notes in the repository', () => {
    const notes = fs.readFileSync(path.join(extensionRoot, 'docs/CONTRIBUTING-NOTES.md'), 'utf8');
    expect(notes).toContain('Status:');
    expect(notes).toContain('Owner role:');
    expect(notes).toContain('pnpm --filter agi-workforce typecheck');
    expect(notes).toContain('Trust boundaries');
  });
});

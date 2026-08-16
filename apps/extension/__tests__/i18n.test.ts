
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { t } from '../src/i18n';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const catalog = JSON.parse(
  readFileSync(join(APP_ROOT, '_locales', 'en', 'messages.json'), 'utf8'),
) as Record<string, { message: string; placeholders?: Record<string, { content: string }> }>;

const manifest = JSON.parse(readFileSync(join(APP_ROOT, 'manifest.json'), 'utf8')) as Record<
  string,
  unknown
>;

const LOCALIZED_SOURCES = ['src/side_panel.ts', 'src/background.ts'] as const;

function read(relativePath: string): string {
  return readFileSync(join(APP_ROOT, relativePath), 'utf8');
}

function stringLiteralsIn(source: string): string[] {
  const literals: string[] = [];
  let index = 0;

  while (index < source.length) {
    const quote = source[index];
    if (quote !== "'" && quote !== '"' && quote !== '`') {
      index += 1;
      continue;
    }
    index += 1;
    let content = '';
    while (index < source.length && source[index] !== quote) {
      if (source[index] === '\\') {
        content += source[index + 1] ?? '';
        index += 2;
        continue;
      }
      if (quote === '`' && source[index] === '$' && source[index + 1] === '{') {
        let depth = 1;
        index += 2;
        while (index < source.length && depth > 0) {
          if (source[index] === '{') depth += 1;
          else if (source[index] === '}') depth -= 1;
          index += 1;
        }
        continue;
      }
      content += source[index];
      index += 1;
    }
    index += 1;
    literals.push(content);
  }

  return literals;
}

function copyAssignments(source: string): { line: number; expression: string }[] {
  const assignments: { line: number; expression: string }[] = [];
  const pattern = /(?<![=!<>])\.(?:textContent|title|placeholder)\s*\+?=(?!=)/g;

  for (const match of source.matchAll(pattern)) {
    const start = match.index + match[0].length;
    let index = start;
    let quote: string | undefined;
    while (index < source.length) {
      const char = source[index];
      if (quote) {
        if (char === '\\') index += 1;
        else if (char === quote) quote = undefined;
      } else if (char === "'" || char === '"' || char === '`') {
        quote = char;
      } else if (char === ';') {
        break;
      }
      index += 1;
    }
    assignments.push({
      line: source.slice(0, match.index).split('\n').length,
      expression: source.slice(start, index),
    });
  }

  return assignments;
}

describe('extension message catalog', () => {
  it('is declared by the manifest so chrome.i18n can serve it', () => {
    expect(manifest['default_locale']).toBe('en');
  });

  it('resolves every __MSG_*__ reference the manifest makes', () => {
    const references = [...JSON.stringify(manifest).matchAll(/__MSG_([A-Za-z0-9_@]+)__/g)].map(
      (match) => match[1] as string,
    );

    expect(references.length).toBeGreaterThan(0);
    for (const key of references) expect(Object.keys(catalog)).toContain(key);
  });

  it('resolves every key the localized sources ask for', () => {
    for (const file of LOCALIZED_SOURCES) {
      const keys = [...read(file).matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)].map(
        (match) => match[1] as string,
      );
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(Object.keys(catalog), `${file} asks for ${key}`).toContain(key);
      }
    }
  });

  it('has no entry nothing reads — a dead key is a string that never reaches a user', () => {
    const consumers = [
      JSON.stringify(manifest),
      ...LOCALIZED_SOURCES.map((file) => read(file)),
    ].join('\n');

    const unused = Object.keys(catalog).filter(
      (key) => !consumers.includes(`t('${key}'`) && !consumers.includes(`__MSG_${key}__`),
    );
    expect(unused).toEqual([]);
  });

  it('ships in the package, because default_locale without _locales fails to load', () => {
    expect(read('vite.config.ts')).toContain("{ src: '_locales', dest: '.' }");
  });

  it('declares every $NAME$ it interpolates, because Chrome renders an undeclared one literally', () => {
    const undeclared: string[] = [];
    for (const [key, entry] of Object.entries(catalog)) {
      for (const [, name] of entry.message.matchAll(/\$([A-Za-z0-9_]+)\$/g)) {
        if (!entry.placeholders?.[(name as string).toLowerCase()]) {
          undeclared.push(`${key} interpolates $${name}$`);
        }
      }
    }
    expect(undeclared).toEqual([]);
  });
});

function withoutIdentifiers(expression: string): string {
  return (
    expression
      .replace(/\bt\(\s*'[A-Za-z0-9_]+'/g, 't(')
      .replace(/[=!]==?\s*(['"])(?:\\.|(?!\1).)*\1/g, '')
      .replace(/\bsetAttribute\(\s*'[a-z-]+'/g, 'setAttribute(')
      .replace(/\bsetManagedCloudChatState\(\s*'[a-z_]+'/g, 'setManagedCloudChatState(')
      // `action:` carries a ManagedCloudGateAction id, never copy. `actionLabel:`
      // does carry copy, and `\baction:` cannot match it.
      .replace(/\baction:[^,}]*[,}]/g, '')
  );
}

function copyCalls(source: string): { line: number; expression: string }[] {
  const calls: { line: number; expression: string }[] = [];
  const pattern = /\bsetAttribute\(\s*'aria-label'|\bsetManagedCloudChatState\(/g;

  for (const match of source.matchAll(pattern)) {
    const start = match.index;
    let index = source.indexOf('(', start);
    let depth = 0;
    let quote: string | undefined;
    while (index < source.length) {
      const char = source[index];
      if (quote) {
        if (char === '\\') index += 1;
        else if (char === quote) quote = undefined;
      } else if (char === "'" || char === '"' || char === '`') {
        quote = char;
      } else if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
      index += 1;
    }
    calls.push({
      line: source.slice(0, match.index).split('\n').length,
      expression: source.slice(start, index + 1),
    });
  }

  return calls;
}

describe('user-facing copy reaches the DOM through the catalog', () => {
  for (const file of LOCALIZED_SOURCES) {
    it(`${file} assigns textContent, title and placeholder only from the catalog or from data`, () => {
      const offenders = copyAssignments(read(file))
        .filter(({ expression }) =>
          stringLiteralsIn(withoutIdentifiers(expression)).some((literal) =>
            /[A-Za-z]/.test(literal),
          ),
        )
        .map(({ line, expression }) => `${file}:${line} ${expression.trim().slice(0, 80)}`);

      expect(offenders).toEqual([]);
    });

    it(`${file} passes aria-labels and chat-gate copy from the catalog too`, () => {
      const offenders = copyCalls(read(file))
        .filter(({ expression }) =>
          stringLiteralsIn(withoutIdentifiers(expression)).some((literal) =>
            /[A-Za-z]/.test(literal),
          ),
        )
        .map(({ line, expression }) => `${file}:${line} ${expression.trim().slice(0, 80)}`);

      expect(offenders).toEqual([]);
    });
  }

  it('routes the upgrade button by state rather than by reading its own label', () => {
    const panel = read('src/side_panel.ts');
    expect(panel).not.toMatch(/\.textContent\s*===/);
    expect(panel).toContain("quotaUpgradeBtn.dataset['destination'] === 'billing'");
  });
});

describe('t()', () => {
  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('returns whatever Chrome serves, so a translated locale wins', () => {
    const getMessage = vi.fn().mockReturnValue('Abbrechen');
    (globalThis as { chrome?: unknown }).chrome = { i18n: { getMessage } };

    expect(t('spMemoryDelete')).toBe('Abbrechen');
    expect(getMessage).toHaveBeenCalledWith('spMemoryDelete', []);
  });

  it('hands substitutions to chrome.i18n rather than expanding them itself', () => {
    const getMessage = vi.fn().mockReturnValue('Cloud: 42% left');
    (globalThis as { chrome?: unknown }).chrome = { i18n: { getMessage } };

    t('spQuotaCloudUsage', ['42% left']);
    expect(getMessage).toHaveBeenCalledWith('spQuotaCloudUsage', ['42% left']);
  });

  it('keeps no second copy of the English catalog to drift from _locales', () => {
    expect(read('src/i18n.ts')).not.toMatch(/entry\.message|placeholders\?\./);
  });
});

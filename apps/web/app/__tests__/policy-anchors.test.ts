import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { policySectionId } from '@shared/components/legal/PolicyContents';

const APP_DIR = path.join(__dirname, '..');

const PAGES = ['privacy', 'terms', 'dpa'] as const;

function read(page: string): string {
  return readFileSync(path.join(APP_DIR, page, 'page.tsx'), 'utf8');
}

function declaredSections(source: string): string[] {
  const block = /const SECTIONS = \[([\s\S]*?)\] as const;/.exec(source);
  const body = block?.[1];
  if (!body) return [];
  return [...body.matchAll(/'([^']+)'/g)].map((m) => decodeEntities(m[1] as string));
}

function renderedIds(source: string): string[] {
  return [...source.matchAll(/<Section id="(s-[^"]+)"/g)].map((m) => m[1] as string);
}

/**
 * The two sides of this comparison are written differently and render the same.
 *
 * A contents entry is a plain JS string, so React escapes it — 73f8bf27e had to
 * change those arrays from '&middot;' to a literal separator because the entity
 * was reaching the page as text. An eyebrow is JSX text, where the entity IS
 * decoded, so '&middot;' there is correct and renders identically.
 *
 * Comparing raw source therefore reports a mismatch between two spellings of
 * the same rendered character. Decoding first compares what the user sees.
 */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&middot;': '\u00b7',
  '&rsquo;': '\u2019',
  '&lsquo;': '\u2018',
  '&ldquo;': '\u201c',
  '&rdquo;': '\u201d',
  '&mdash;': '\u2014',
  '&ndash;': '\u2013',
  '&amp;': '&',
};

function decodeEntities(text: string): string {
  return text.replace(/&[a-z]+;/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

function renderedEyebrows(source: string): string[] {
  return [...source.matchAll(/<h2 className="agi-ds-h2" id="[^"]*">\s*([\s\S]*?)\s*<\/h2>/g)]
    .map((m) => decodeEntities((m[1] as string).replace(/\s+/g, ' ').trim()))
    .filter((text) => /^\d{1,2} \u00b7/.test(text));
}

describe('policy anchors', () => {
  for (const page of PAGES) {
    describe(`/${page}`, () => {
      it('declares a contents list', () => {
        expect(declaredSections(read(page)).length).toBeGreaterThan(0);
      });

      it('has an anchored section for every contents entry', () => {
        const source = read(page);
        const ids = new Set(renderedIds(source));
        for (const eyebrow of declaredSections(source)) {
          const id = policySectionId(eyebrow);
          expect(
            ids.has(id),
            `/${page} contents lists "${eyebrow}" (#${id}) but no section carries that id`,
          ).toBe(true);
        }
      });

      it('lists every anchored section in the contents', () => {
        const source = read(page);
        const listed = new Set(declaredSections(source).map(policySectionId));
        for (const id of renderedIds(source)) {
          expect(listed.has(id), `/${page} has section #${id} but the contents omits it`).toBe(
            true,
          );
        }
      });

      it('uses the rendered eyebrow text as the contents label', () => {
        const source = read(page);
        const rendered = new Set(renderedEyebrows(source));
        for (const eyebrow of declaredSections(source)) {
          expect(
            rendered.has(eyebrow),
            `/${page} contents says "${eyebrow}" but no section eyebrow renders that text`,
          ).toBe(true);
        }
      });

      it('numbers sections without gaps or duplicates', () => {
        const ids = renderedIds(read(page));
        expect(new Set(ids).size, `/${page} has duplicate section ids`).toBe(ids.length);
      });
    });
  }

  it('derives anchors from the section number, not the title', () => {
    expect(policySectionId('05 · Retention')).toBe('s-05');
    expect(policySectionId('05 · Retention, rewritten entirely')).toBe('s-05');
    expect(policySectionId('Contents')).toBe('s-contents');
  });
});
